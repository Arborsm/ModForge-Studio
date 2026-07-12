using System.Diagnostics;

internal static class ProbeRunner
{
    public static ProbeResult Run(ProbeRequest request, CancellationToken cancellationToken)
    {
        var startedAt = Stopwatch.StartNew();
        if (!Directory.Exists(request.ModPath))
        {
            return ProbeResult.Failed($"Mod path does not exist: {request.ModPath}");
        }

        var state = CreateState(request, runtimeAttempted: request.Mode != ProbeMode.Inspect, request.Mode == ProbeMode.Inspect
            ? "metadata-only"
            : "headless-entry");
        var resolution = ResolveProbeDll(request.ModPath);
        if (resolution.Error is not null)
        {
            state.FailureStage = "manifest";
            state.Warn(resolution.Error);
            state.DurationMs = startedAt.ElapsedMilliseconds;
            return new ProbeResult("failed", [], state.Warnings, state.Diagnostics());
        }
        if (resolution.EntryDll is null)
        {
            state.DurationMs = startedAt.ElapsedMilliseconds;
            return new ProbeResult("not-run", [], [], state.Diagnostics());
        }

        return request.Mode == ProbeMode.Inspect
            ? RunInspect(request, resolution.EntryDll, state, startedAt, cancellationToken)
            : RunRuntime(request, resolution.EntryDll, state, startedAt, cancellationToken);
    }

    private static ProbeResult RunInspect(
        ProbeRequest request,
        string dll,
        ProbeState state,
        Stopwatch startedAt,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        state.DllsScanned++;
        try
        {
            MetadataInspector.Inspect(dll, state, collectFields: true);
        }
        catch (Exception ex)
        {
            state.FailureStage = "metadata";
            state.Warn($"{Path.GetFileName(dll)} metadata inspection failed: {ex.GetBaseException().Message}");
        }

        state.DurationMs = startedAt.ElapsedMilliseconds;
        return new ProbeResult(
            state.FailureStage == "metadata" ? "failed" : "not-run",
            state.Fields,
            state.Warnings,
            state.Diagnostics());
    }

    private static ProbeResult RunRuntime(
        ProbeRequest request,
        string dll,
        ProbeState state,
        Stopwatch startedAt,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        state.DllsScanned++;
        try
        {
            MetadataInspector.Inspect(dll, state, collectFields: false);
        }
        catch (Exception ex)
        {
            state.NoteAssemblyLoad($"{Path.GetFileName(dll)} metadata diagnostics failed: {ex.GetBaseException().Message}");
        }
        HeadlessEntryRunner.Run(dll, request, state, cancellationToken);
        if (state.GmcmFieldsCaptured == 0)
        {
            StaticConfigScanner.Collect(dll, request, state);
        }

        state.DurationMs = startedAt.ElapsedMilliseconds;
        return ProbeStatusBuilder.Build(state);
    }

    private static ProbeState CreateState(ProbeRequest request, bool runtimeAttempted, string captureStrategy)
    {
        return new ProbeState(request.ModPath)
        {
            GamePathResolved = ProbeAssemblyLoadContext.ResolveGamePath(request.ModPath, request.GamePath),
            ExecutionMode = request.ModeName,
            RuntimeAttempted = runtimeAttempted,
            CaptureStrategy = captureStrategy,
        };
    }

    private static ProbeDllResolution ResolveProbeDll(string modPath)
    {
        if (!ProbePathSafety.TryResolveRelativeFileWithinRoot(
            modPath,
            "manifest.json",
            out var manifestPath,
            out var manifestError))
        {
            return new(
                null,
                manifestError is null
                    ? $"Mod manifest does not exist: {Path.Combine(modPath, "manifest.json")}"
                    : $"Mod manifest is invalid: {manifestError}");
        }

        try
        {
            using var document = JsonDocument.Parse(
                File.ReadAllText(manifestPath),
                new() { CommentHandling = JsonCommentHandling.Skip, AllowTrailingCommas = true });
            if (!document.RootElement.TryGetProperty("EntryDll", out var entryDll))
            {
                return new(null, null);
            }
            if (entryDll.ValueKind != JsonValueKind.String
                || string.IsNullOrWhiteSpace(entryDll.GetString()))
            {
                return new(null, "manifest.json EntryDll must be a non-empty relative path.");
            }

            var relativePath = entryDll.GetString()!.Trim();
            if (Path.IsPathRooted(relativePath))
            {
                return new(null, $"manifest.json EntryDll must be relative: {relativePath}");
            }
            if (!Path.GetExtension(relativePath).Equals(".dll", StringComparison.OrdinalIgnoreCase))
            {
                return new(null, $"manifest.json EntryDll must reference a DLL: {relativePath}");
            }

            var lexicalRoot = Path.GetFullPath(modPath);
            var candidate = Path.GetFullPath(Path.Combine(lexicalRoot, relativePath));
            if (!ProbePathSafety.IsWithin(lexicalRoot, candidate))
            {
                return new(null, $"manifest.json EntryDll escapes the mod root: {relativePath}");
            }
            if (!ProbePathSafety.TryResolveFileWithinRoot(
                lexicalRoot,
                candidate,
                out var resolved,
                out var error))
            {
                return new(null, $"manifest.json EntryDll is invalid: {relativePath} ({error})");
            }

            return new(resolved, null);
        }
        catch (Exception ex) when (ex is JsonException or IOException or UnauthorizedAccessException or ArgumentException)
        {
            return new(null, $"manifest.json could not be parsed: {ex.GetBaseException().Message}");
        }
    }

    private sealed record ProbeDllResolution(string? EntryDll, string? Error);
}
