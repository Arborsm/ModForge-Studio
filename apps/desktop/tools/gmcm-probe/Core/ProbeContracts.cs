internal enum ProbeMode
{
    Auto,
    Inspect,
    Runtime,
}

internal sealed record ProbeRequest(string ModPath, string? GamePath, int TimeoutMs, ProbeMode Mode)
{
    public static ProbeRequest Parse(string[] args)
    {
        string? modPath = null;
        string? gamePath = null;
        var timeoutMs = 3000;
        var mode = ProbeMode.Auto;
        for (var index = 0; index < args.Length; index++)
        {
            switch (args[index])
            {
                case "--mod-path" when index + 1 < args.Length:
                    modPath = args[++index];
                    break;
                case "--game-path" when index + 1 < args.Length:
                    gamePath = args[++index];
                    break;
                case "--timeout-ms" when index + 1 < args.Length && int.TryParse(args[++index], out var parsed):
                    timeoutMs = Math.Clamp(parsed, 500, 30000);
                    break;
                case "--mode" when index + 1 < args.Length:
                    mode = ParseMode(args[++index]);
                    break;
                case "--mode":
                    throw new InvalidOperationException("--mode requires auto, inspect, or runtime.");
            }
        }

        if (string.IsNullOrWhiteSpace(modPath))
        {
            throw new InvalidOperationException("--mod-path is required.");
        }

        return new ProbeRequest(
            Path.GetFullPath(modPath),
            string.IsNullOrWhiteSpace(gamePath) ? null : Path.GetFullPath(gamePath),
            timeoutMs,
            mode);
    }

    public string ModeName => Mode.ToString().ToLowerInvariant();

    private static ProbeMode ParseMode(string value)
    {
        return value.ToLowerInvariant() switch
        {
            "auto" => ProbeMode.Auto,
            "inspect" => ProbeMode.Inspect,
            "runtime" => ProbeMode.Runtime,
            _ => throw new InvalidOperationException("--mode must be auto, inspect, or runtime."),
        };
    }
}

internal sealed record ProbeResult(
    string ProbeStatus,
    List<ProbeField> Fields,
    List<string> Warnings,
    ProbeDiagnostics? Diagnostics = null)
{
    public static ProbeResult Failed(string warning) => new("failed", [], [warning], null);
    public static ProbeResult TimedOut() => new("timed-out", [], ["GMCM probe timed out."], null);
}

internal sealed record ProbeDiagnostics(
    int DllsScanned,
    int SmapiModsFound,
    int GmcmFieldsCaptured,
    int StaticFieldsCaptured,
    int WarningCount,
    string? GamePathResolved,
    List<string> GameAssembliesResolved,
    List<string> AssemblyLoadWarnings,
    string? ModsRootResolved,
    int SiblingAssemblyCount,
    List<string> DependencyAssembliesResolved,
    List<string> AssemblyResolveMisses,
    bool GmcmDetected,
    string ExecutionMode,
    bool RuntimeAttempted,
    string? CaptureStrategy,
    string? FailureStage,
    string? SmapiSource,
    string? RequestedSmapiVersion,
    string? ResolvedSmapiVersion,
    long DurationMs,
    List<ProbeAssemblyReference> AssemblyReferences,
    List<ProbeRegistrationCandidate> RegistrationCandidates);

internal sealed record ProbeAssemblyReference(
    string SourceAssembly,
    string Name,
    string Version,
    string? Culture,
    string? PublicKeyToken);

internal sealed record ProbeRegistrationCandidate(
    string SourceAssembly,
    string DeclaringType,
    string MethodName,
    int MetadataToken,
    bool IsStatic,
    List<string> ParameterTypes,
    string SourcePath,
    string EntryType);

internal sealed record ProbeField(
    string Key,
    string Label,
    string? Description,
    string? Section,
    string FieldType,
    object? DefaultValue,
    List<object?> AllowValues,
    bool AllowBlank,
    bool AllowMultiple,
    string Source,
    string? UiHint = null,
    bool StorageKeyReliable = true,
    bool CanMatchExistingConfigKey = true);

internal sealed class ProbeState(string modPath)
{
    public string ModPath { get; } = modPath;
    public List<ProbeField> Fields { get; } = [];
    public List<string> Warnings { get; } = [];
    public string? CurrentSection { get; set; }
    public string? CurrentPage { get; set; }
    public int DllsScanned { get; set; }
    public int SmapiModsFound { get; set; }
    public int GmcmFieldsCaptured { get; set; }
    public int StaticFieldsCaptured { get; set; }
    public string? GamePathResolved { get; set; }
    public string? ModsRootResolved { get; set; }
    public int SiblingAssemblyCount { get; set; }
    public List<string> GameAssembliesResolved { get; } = [];
    public List<string> AssemblyLoadWarnings { get; } = [];
    public List<string> DependencyAssembliesResolved { get; } = [];
    public List<string> AssemblyResolveMisses { get; } = [];
    public bool GmcmDetected { get; set; }
    public int GmcmInteractionCount { get; private set; }
    public string ExecutionMode { get; set; } = "auto";
    public bool RuntimeAttempted { get; set; }
    public string? CaptureStrategy { get; set; }
    public string? FailureStage { get; set; }
    public string? SmapiSource { get; set; }
    public string? RequestedSmapiVersion { get; set; }
    public string? ResolvedSmapiVersion { get; set; }
    public long DurationMs { get; set; }
    public List<ProbeAssemblyReference> AssemblyReferences { get; } = [];
    public List<ProbeRegistrationCandidate> RegistrationCandidates { get; } = [];

    public void AddField(ProbeField field)
    {
        if (Fields.Any(existing => string.Equals(existing.Key, field.Key, StringComparison.OrdinalIgnoreCase)))
        {
            if (field.Source != "generic-mod-config-menu")
            {
                return;
            }

            var suffix = 2;
            var key = $"{field.Key}{suffix}";
            while (Fields.Any(existing => string.Equals(existing.Key, key, StringComparison.OrdinalIgnoreCase)))
            {
                suffix++;
                key = $"{field.Key}{suffix}";
            }

            field = field with
            {
                Key = key,
                DefaultValue = null,
                StorageKeyReliable = false,
                CanMatchExistingConfigKey = false,
            };
        }

        Fields.Add(field);
        if (field.Source == "generic-mod-config-menu")
        {
            GmcmFieldsCaptured++;
        }
        if (field.Source == "dll-static")
        {
            StaticFieldsCaptured++;
        }
    }

    public void Warn(string message)
    {
        Warnings.Add(message);
    }

    public void NoteAssemblyLoad(string message)
    {
        AssemblyLoadWarnings.Add(message);
    }

    public void NoteGameAssembly(string path)
    {
        GameAssembliesResolved.Add(path);
    }

    public void NoteDependencyAssembly(string assemblyName, string path)
    {
        DependencyAssembliesResolved.Add($"{assemblyName} -> {path}");
    }

    public void NoteAssemblyResolveMiss(AssemblyName assemblyName)
    {
        AssemblyResolveMisses.Add($"{assemblyName.Name}, Version={assemblyName.Version?.ToString() ?? "<none>"}");
    }

    public void NoteAssemblyReference(ProbeAssemblyReference reference)
    {
        AssemblyReferences.Add(reference);
    }

    public void NoteRegistrationCandidate(ProbeRegistrationCandidate candidate)
    {
        if (!RegistrationCandidates.Any(existing => ProbePathSafety.PathComparer.Equals(
                existing.SourcePath,
                candidate.SourcePath)
            && existing.MetadataToken == candidate.MetadataToken
            && existing.EntryType.Equals(candidate.EntryType, StringComparison.Ordinal)))
        {
            RegistrationCandidates.Add(candidate);
        }
    }

    public void NoteGmcmInteraction()
    {
        GmcmInteractionCount++;
    }

    public ProbeDiagnostics Diagnostics() => new(
        DllsScanned,
        SmapiModsFound,
        GmcmFieldsCaptured,
        StaticFieldsCaptured,
        Warnings.Count,
        GamePathResolved,
        GameAssembliesResolved.Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(value => value, StringComparer.OrdinalIgnoreCase).ToList(),
        AssemblyLoadWarnings.Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(value => value, StringComparer.OrdinalIgnoreCase).ToList(),
        ModsRootResolved,
        SiblingAssemblyCount,
        DependencyAssembliesResolved.Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(value => value, StringComparer.OrdinalIgnoreCase).ToList(),
        AssemblyResolveMisses.Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(value => value, StringComparer.OrdinalIgnoreCase).ToList(),
        GmcmDetected,
        ExecutionMode,
        RuntimeAttempted,
        CaptureStrategy,
        FailureStage,
        SmapiSource,
        RequestedSmapiVersion,
        ResolvedSmapiVersion,
        DurationMs,
        AssemblyReferences
            .Distinct()
            .OrderBy(reference => reference.SourceAssembly, StringComparer.OrdinalIgnoreCase)
            .ThenBy(reference => reference.Name, StringComparer.OrdinalIgnoreCase)
            .ToList(),
        RegistrationCandidates
            .OrderBy(candidate => candidate.SourceAssembly, StringComparer.OrdinalIgnoreCase)
            .ThenBy(candidate => candidate.DeclaringType, StringComparer.Ordinal)
            .ThenBy(candidate => candidate.MetadataToken)
            .ToList());
}

internal sealed record RuntimeHelperBundle(object Helper, object Monitor);

internal sealed record RuntimeProxyContext(
    string Role,
    ProbeState? State,
    Assembly? SmapiAssembly,
    ProbeManifestData? Manifest,
    IReadOnlyDictionary<string, object?>? Properties,
    RuntimeEventStore? Events);


internal sealed class NullObject
{
    public static readonly NullObject Instance = new();
    private NullObject()
    {
    }
}

internal sealed record ProbeManifestData(string Name, string UniqueId, string Version, string Author, string Description)
{
    public static ProbeManifestData Load(string modPath)
    {
        if (!ProbePathSafety.TryResolveRelativeFileWithinRoot(
            modPath,
            "manifest.json",
            out var manifestPath,
            out _))
        {
            var name = Path.GetFileName(modPath);
            return new(name, name, "0.0.0", "", "");
        }

        using var document = JsonDocument.Parse(
            File.ReadAllText(manifestPath),
            new() { CommentHandling = JsonCommentHandling.Skip, AllowTrailingCommas = true });
        var root = document.RootElement;
        return new(
            GetString(root, "Name") ?? Path.GetFileName(modPath),
            GetString(root, "UniqueID") ?? Path.GetFileName(modPath),
            GetString(root, "Version") ?? "0.0.0",
            GetString(root, "Author") ?? "",
            GetString(root, "Description") ?? "");
    }

    private static string? GetString(JsonElement root, string key)
    {
        return root.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;
    }
}
