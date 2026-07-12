internal sealed class ProbeAssemblyLoadContext : AssemblyLoadContext
{
    private static readonly Assembly ProbeAssembly = typeof(ProbeAssemblyLoadContext).Assembly;
    private static readonly Assembly SmapiShimAssembly = typeof(StardewModdingAPI.Mod).Assembly;
    private static readonly Assembly SmapiCoreInterfacesShimAssembly = typeof(StardewModdingAPI.IManifest).Assembly;
    private static readonly Assembly HarmonyShimAssembly = typeof(HarmonyLib.Harmony).Assembly;
    private readonly string modPath;
    private readonly string entryDirectory;
    private readonly string? gamePath;
    private readonly ProbeState state;
    private readonly List<string> gameAssemblyDirectories;
    private readonly Lazy<ProbeLocalAssemblyIndex> localAssemblies;
    private readonly Lazy<DependencyAssemblyIndex> dependencyAssemblies;
    private readonly bool preferBundledSmapi;
    private Assembly? smapiAssembly;

    public ProbeAssemblyLoadContext(string modPath, string? explicitGamePath, ProbeState state, bool preferBundledSmapi = false)
        : base(isCollectible: false)
    {
        this.modPath = ProbePathSafety.ResolveExistingRealPath(state.ModPath);
        entryDirectory = ProbePathSafety.ResolveExistingRealPath(modPath);
        if (!ProbePathSafety.IsWithinOrEqual(this.modPath, entryDirectory))
        {
            throw new InvalidOperationException($"Probe entry directory resolves outside the mod root: {entryDirectory}");
        }
        this.state = state;
        this.preferBundledSmapi = preferBundledSmapi;
        gamePath = ResolveGamePath(modPath, explicitGamePath);
        gameAssemblyDirectories = ResolveGameAssemblyDirectories(gamePath);
        localAssemblies = new(
            () => ProbeLocalAssemblyIndex.Build(this.modPath),
            LazyThreadSafetyMode.ExecutionAndPublication);
        dependencyAssemblies = new(
            () => DependencyAssemblyIndex.Build(this.modPath),
            LazyThreadSafetyMode.ExecutionAndPublication);
        this.state.GamePathResolved ??= gamePath;
        this.state.ModsRootResolved ??= ResolveModsRoot(modPath)?.FullName;
        Resolving += (_, assemblyName) => ResolveBySimpleName(assemblyName);
    }

    public Assembly SmapiAssembly => smapiAssembly ??= LoadSmapiAssembly();

    public IReadOnlyList<ProbeDependencyMod> GetBootstrapDependencies(Assembly targetAssembly)
    {
        return dependencyAssemblies.Value.GetBootstrapDependencies(targetAssembly);
    }

    public Assembly LoadBundledAssembly(string relativePath)
    {
        if (!ProbePathSafety.TryResolveRelativeFileWithinRoot(
            modPath,
            relativePath,
            out var assemblyPath,
            out var pathError))
        {
            throw new InvalidOperationException(
                pathError ?? $"Bundled assembly does not exist within the mod root: {relativePath}");
        }

        foreach (var assembly in Assemblies)
        {
            try
            {
                if (ProbePathSafety.PathComparer.Equals(
                    ProbePathSafety.ResolveExistingRealPath(assembly.Location),
                    assemblyPath))
                {
                    return assembly;
                }
            }
            catch (Exception ex) when (ex is IOException or NotSupportedException)
            {
                // Dynamic or removed assemblies cannot match a canonical bundled path.
            }
        }

        return LoadFromAssemblyPath(assemblyPath);
    }

    protected override Assembly? Load(AssemblyName assemblyName)
    {
        if (assemblyName.Name == "StardewModdingAPI")
        {
            return preferBundledSmapi ? SmapiShimAssembly : SmapiAssembly;
        }
        if (assemblyName.Name == "SMAPI.Toolkit.CoreInterfaces" && preferBundledSmapi)
        {
            return SmapiCoreInterfacesShimAssembly;
        }
        if (IsHarmonyAssembly(assemblyName))
        {
            state.NoteAssemblyLoad($"Resolved {assemblyName.Name} to bundled no-op Harmony shim for headless GMCM probing.");
            return HarmonyShimAssembly;
        }
        if (assemblyName.Name is "modforge-gmcm-probe")
        {
            return ProbeAssembly;
        }

        if (localAssemblies.Value.TryResolve(assemblyName, entryDirectory, out var localDll, out var localDetail))
        {
            if (!string.IsNullOrWhiteSpace(localDetail))
            {
                state.NoteAssemblyLoad(localDetail);
            }
            return LoadFromAssemblyPath(localDll);
        }

        return ResolveBySimpleName(assemblyName);
    }

    private Assembly? ResolveBySimpleName(AssemblyName assemblyName)
    {
        if (gamePath is not null)
        {
            foreach (var directory in gameAssemblyDirectories)
            {
                var gameDll = Path.Combine(directory, $"{assemblyName.Name}.dll");
                if (ProbeAssemblyIdentity.TryValidateCandidate(
                    directory,
                    gameDll,
                    assemblyName,
                    out var resolvedGameDll,
                    out var rejection))
                {
                    state.NoteGameAssembly(resolvedGameDll);
                    return LoadFromAssemblyPath(resolvedGameDll);
                }
                if (File.Exists(gameDll) && rejection is not null)
                {
                    state.NoteAssemblyLoad(rejection);
                }
            }
        }

        if (!string.IsNullOrWhiteSpace(assemblyName.Name)
            && dependencyAssemblies.Value.TryResolve(assemblyName, out var dependencyDll, out var resolutionDetail)
            && File.Exists(dependencyDll))
        {
            state.NoteDependencyAssembly(assemblyName.Name, dependencyDll);
            if (!string.IsNullOrWhiteSpace(resolutionDetail))
            {
                state.NoteAssemblyLoad(resolutionDetail);
            }
            return LoadFromAssemblyPath(dependencyDll);
        }

        if (dependencyAssemblies.IsValueCreated
            && dependencyAssemblies.Value.LastResolutionDiagnostic is { Length: > 0 } diagnostic)
        {
            state.NoteAssemblyLoad(diagnostic);
        }

        if (!string.IsNullOrWhiteSpace(assemblyName.Name))
        {
            state.NoteAssemblyResolveMiss(assemblyName);
        }

        return null;
    }

    private Assembly LoadSmapiAssembly()
    {
        if (preferBundledSmapi)
        {
            state.NoteAssemblyLoad("Using bundled SMAPI shim for retry after real SMAPI headless runtime failure.");
            state.SmapiSource = "shim";
            state.ResolvedSmapiVersion = SmapiShimAssembly.GetName().Version?.ToString();
            return SmapiShimAssembly;
        }

        if (gamePath is not null)
        {
            foreach (var directory in gameAssemblyDirectories)
            {
                var smapiDll = Path.Combine(directory, "StardewModdingAPI.dll");
                var requestedSmapi = new AssemblyName("StardewModdingAPI");
                if (Version.TryParse(state.RequestedSmapiVersion, out var requestedVersion))
                {
                    requestedSmapi.Version = requestedVersion;
                }
                if (ProbeAssemblyIdentity.TryValidateCandidate(
                    directory,
                    smapiDll,
                    requestedSmapi,
                    out var resolvedSmapiDll,
                    out var rejection))
                {
                    state.NoteGameAssembly(resolvedSmapiDll);
                    state.SmapiSource = "game";
                    state.ResolvedSmapiVersion = AssemblyName.GetAssemblyName(resolvedSmapiDll).Version?.ToString();
                    return LoadFromAssemblyPath(resolvedSmapiDll);
                }
                if (File.Exists(smapiDll) && rejection is not null)
                {
                    state.NoteAssemblyLoad(rejection);
                }
            }

            state.NoteAssemblyLoad($"StardewModdingAPI.dll was not found in {gamePath}.");
        }

        state.NoteAssemblyLoad("Using bundled SMAPI shim because no game SMAPI assembly was resolved.");
        state.SmapiSource = "shim";
        state.ResolvedSmapiVersion = SmapiShimAssembly.GetName().Version?.ToString();
        return SmapiShimAssembly;
    }

    public static bool IsHarmonyAssembly(AssemblyName assemblyName)
    {
        return assemblyName.Name?.Equals("0Harmony", StringComparison.OrdinalIgnoreCase) == true
            || assemblyName.Name?.Equals("HarmonyLib", StringComparison.OrdinalIgnoreCase) == true;
    }

    public static string? ResolveGamePath(string modPath, string? explicitGamePath)
    {
        if (!string.IsNullOrWhiteSpace(explicitGamePath) && Directory.Exists(explicitGamePath))
        {
            return ProbePathSafety.ResolveExistingRealPath(explicitGamePath);
        }

        var current = new DirectoryInfo(modPath);
        while (current is not null)
        {
            if (current.Name.Equals("Mods", StringComparison.OrdinalIgnoreCase))
            {
                return current.Parent is null
                    ? null
                    : ProbePathSafety.ResolveExistingRealPath(current.Parent.FullName);
            }

            current = current.Parent;
        }

        return null;
    }

    public static List<string> ResolveGameAssemblyDirectories(string? gamePath)
    {
        if (gamePath is null)
        {
            return [];
        }

        string[] candidates =
        [
            gamePath,
            Path.Combine(gamePath, "smapi-internal"),
            Path.Combine(gamePath, "internal"),
        ];
        return candidates
            .Where(Directory.Exists)
            .Select(ProbePathSafety.ResolveExistingRealPath)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public static DirectoryInfo? ResolveModsRoot(string modPath)
    {
        var current = new DirectoryInfo(modPath);
        DirectoryInfo? match = null;
        while (current.Parent is not null)
        {
            if (LooksLikeModsRoot(current.Parent))
            {
                match = current.Parent;
            }

            current = current.Parent;
        }

        return match ?? Directory.GetParent(modPath);
    }

    private static bool LooksLikeModsRoot(DirectoryInfo directory)
    {
        try
        {
            return directory.EnumerateDirectories()
                .Take(32)
                .Count(child => File.Exists(Path.Combine(child.FullName, "manifest.json"))) >= 2;
        }
        catch
        {
            return false;
        }
    }

    internal static IEnumerable<string> SafeEnumerateDlls(string directory)
    {
        try
        {
            return ProbePathSafety.EnumerateDlls(directory, 4096)
                .Where(path => !path.Contains($"{Path.DirectorySeparatorChar}old{Path.DirectorySeparatorChar}", StringComparison.OrdinalIgnoreCase))
                .ToList();
        }
        catch
        {
            return [];
        }
    }
}

internal sealed class DependencyAssemblyIndex
{
    private static readonly Dictionary<string, DependencyAssemblyIndex> Cache = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, List<AssemblyCandidate>> byAssemblyName;
    private readonly HashSet<string> declaredDependencyIds;
    private readonly HashSet<string> bootstrapDependencyIds;
    private readonly Dictionary<string, ManifestAssemblyOwner> manifestsByUniqueId;

    private DependencyAssemblyIndex(
        string? modsRoot,
        Dictionary<string, List<AssemblyCandidate>> byAssemblyName,
        HashSet<string> declaredDependencyIds,
        HashSet<string> bootstrapDependencyIds,
        Dictionary<string, ManifestAssemblyOwner> manifestsByUniqueId)
    {
        ModsRoot = modsRoot;
        this.byAssemblyName = byAssemblyName;
        this.declaredDependencyIds = declaredDependencyIds;
        this.bootstrapDependencyIds = bootstrapDependencyIds;
        this.manifestsByUniqueId = manifestsByUniqueId;
    }

    public string? ModsRoot { get; }
    public string? LastResolutionDiagnostic { get; private set; }

    public static DependencyAssemblyIndex Build(string modPath)
    {
        var root = ProbeAssemblyLoadContext.ResolveModsRoot(modPath);
        if (root is null || !root.Exists)
        {
            return new(
                null,
                new(StringComparer.OrdinalIgnoreCase),
                new(StringComparer.OrdinalIgnoreCase),
                new(StringComparer.OrdinalIgnoreCase),
                new(StringComparer.OrdinalIgnoreCase));
        }

        var rootPath = Path.GetFullPath(root.FullName);
        var cacheKey = $"{rootPath}|{Path.GetFullPath(modPath)}";
        lock (Cache)
        {
            if (Cache.TryGetValue(cacheKey, out var cached))
            {
                return cached;
            }
        }

        var manifests = ReadManifests(rootPath);
        var declaredDependencies = ReadDeclaredDependencies(Path.Combine(modPath, "manifest.json"));
        var declaredIds = declaredDependencies
            .Select(dependency => dependency.UniqueId)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var bootstrapIds = declaredDependencies
            .Where(dependency => dependency.IsRequired)
            .Select(dependency => dependency.UniqueId)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        Dictionary<string, List<AssemblyCandidate>> result = new(StringComparer.OrdinalIgnoreCase);
        foreach (var dll in ProbeAssemblyLoadContext.SafeEnumerateDlls(rootPath))
        {
            try
            {
                var identity = AssemblyName.GetAssemblyName(dll);
                if (string.IsNullOrWhiteSpace(identity.Name))
                {
                    continue;
                }

                var owner = FindOwningManifest(dll, manifests);
                if (!result.TryGetValue(identity.Name, out var candidates))
                {
                    candidates = [];
                    result[identity.Name] = candidates;
                }
                candidates.Add(new(ProbePathSafety.ResolveExistingRealPath(dll), identity, owner?.UniqueId));
            }
            catch
            {
                // Ignore native or invalid DLLs in mod folders.
            }
        }

        DependencyAssemblyIndex index = new(
            rootPath,
            result,
            declaredIds,
            bootstrapIds,
            manifests
                .GroupBy(manifest => manifest.UniqueId, StringComparer.OrdinalIgnoreCase)
                .Where(group => group.Count() == 1)
                .ToDictionary(group => group.Key, group => group.Single(), StringComparer.OrdinalIgnoreCase));
        lock (Cache)
        {
            if (Cache.TryGetValue(cacheKey, out var cached))
            {
                return cached;
            }

            Cache[cacheKey] = index;
            return index;
        }
    }

    public bool TryResolve(AssemblyName assemblyName, out string dll, out string? detail)
    {
        dll = "";
        detail = null;
        LastResolutionDiagnostic = null;
        if (string.IsNullOrWhiteSpace(assemblyName.Name)
            || !byAssemblyName.TryGetValue(assemblyName.Name, out var candidates))
        {
            return false;
        }

        var compatible = candidates
            .Where(candidate => File.Exists(candidate.Path) && ProbeAssemblyIdentity.CompatibilityScore(assemblyName, candidate.Identity) > 0)
            .ToList();
        if (compatible.Count == 0)
        {
            LastResolutionDiagnostic = $"No compatible mod assembly was found for {assemblyName.FullName}.";
            return false;
        }

        var declared = compatible
            .Where(candidate => candidate.OwnerUniqueId is not null && declaredDependencyIds.Contains(candidate.OwnerUniqueId))
            .ToList();
        if (declared.Count > 0)
        {
            var selected = SelectBest(assemblyName, declared);
            dll = selected.Path;
            detail = $"Resolved declared mod dependency {assemblyName.Name} from {selected.OwnerUniqueId}: {selected.Path}.";
            return true;
        }

        var bestScore = compatible.Max(candidate => ProbeAssemblyIdentity.CompatibilityScore(assemblyName, candidate.Identity));
        var bestVersion = compatible
            .Where(candidate => ProbeAssemblyIdentity.CompatibilityScore(assemblyName, candidate.Identity) == bestScore)
            .Max(candidate => candidate.Identity.Version ?? new Version());
        var best = compatible
            .Where(candidate => ProbeAssemblyIdentity.CompatibilityScore(assemblyName, candidate.Identity) == bestScore
                && (candidate.Identity.Version ?? new Version()) == bestVersion)
            .Select(candidate => candidate with { Path = Path.GetFullPath(candidate.Path) })
            .DistinctBy(candidate => candidate.Path, StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (best.Count != 1)
        {
            LastResolutionDiagnostic = $"Skipped ambiguous global mod dependency {assemblyName.FullName}; compatible candidates: {string.Join(", ", best.Select(candidate => candidate.Path))}.";
            return false;
        }

        dll = best[0].Path;
        detail = $"Resolved unique version-compatible global mod dependency {assemblyName.Name} from {dll}.";
        return true;
    }

    public IReadOnlyList<ProbeDependencyMod> GetBootstrapDependencies(Assembly targetAssembly)
    {
        List<ProbeDependencyMod> result = [];
        HashSet<string> seen = new(StringComparer.OrdinalIgnoreCase);
        foreach (var reference in targetAssembly.GetReferencedAssemblies())
        {
            if (string.IsNullOrWhiteSpace(reference.Name)
                || !byAssemblyName.TryGetValue(reference.Name, out var candidates))
            {
                continue;
            }

            foreach (var ownerId in candidates
                .Select(candidate => candidate.OwnerUniqueId)
                .Where(ownerId => ownerId is not null && bootstrapDependencyIds.Contains(ownerId))
                .Cast<string>()
                .Distinct(StringComparer.OrdinalIgnoreCase))
            {
                if (!seen.Add(ownerId)
                    || !manifestsByUniqueId.TryGetValue(ownerId, out var manifest)
                    || manifest.EntryDllPath is null)
                {
                    continue;
                }
                result.Add(new(ownerId, manifest.Directory, manifest.EntryDllPath));
            }
        }

        return result
            .OrderBy(dependency => dependency.UniqueId, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static AssemblyCandidate SelectBest(AssemblyName requested, List<AssemblyCandidate> candidates)
    {
        return candidates
            .OrderByDescending(candidate => ProbeAssemblyIdentity.CompatibilityScore(requested, candidate.Identity))
            .ThenByDescending(candidate => candidate.Identity.Version)
            .ThenBy(candidate => candidate.Path, StringComparer.OrdinalIgnoreCase)
            .First();
    }

    private static List<ManifestAssemblyOwner> ReadManifests(string rootPath)
    {
        List<ManifestAssemblyOwner> result = [];
        IEnumerable<string> paths;
        try
        {
            paths = ProbePathSafety.EnumerateNamedFiles(rootPath, "manifest.json", 2048).ToList();
        }
        catch
        {
            return result;
        }

        foreach (var path in paths)
        {
            try
            {
                using var document = JsonDocument.Parse(
                    File.ReadAllText(path),
                    new() { CommentHandling = JsonCommentHandling.Skip, AllowTrailingCommas = true });
                if (document.RootElement.TryGetProperty("UniqueID", out var uniqueId)
                    && uniqueId.ValueKind == JsonValueKind.String
                    && uniqueId.GetString() is { Length: > 0 } value)
                {
                    var directory = Path.GetDirectoryName(path)!;
                    string? entryDllPath = null;
                    if (document.RootElement.TryGetProperty("EntryDll", out var entryDll)
                        && entryDll.ValueKind == JsonValueKind.String
                        && entryDll.GetString() is { Length: > 0 } relativeEntry
                        && ProbePathSafety.TryResolveRelativeFileWithinRoot(
                            directory,
                            relativeEntry,
                            out var resolvedEntry,
                            out _))
                    {
                        entryDllPath = resolvedEntry;
                    }
                    result.Add(new(directory, value, entryDllPath));
                }
            }
            catch
            {
                // Invalid manifests are ignored by the dependency fallback.
            }
        }

        return result.OrderByDescending(owner => owner.Directory.Length).ToList();
    }

    private static List<DeclaredDependency> ReadDeclaredDependencies(string manifestPath)
    {
        List<DeclaredDependency> result = [];
        try
        {
            if (!File.Exists(manifestPath))
            {
                return result;
            }

            using var document = JsonDocument.Parse(
                File.ReadAllText(manifestPath),
                new() { CommentHandling = JsonCommentHandling.Skip, AllowTrailingCommas = true });
            if (!document.RootElement.TryGetProperty("Dependencies", out var dependencies)
                || dependencies.ValueKind != JsonValueKind.Array)
            {
                return result;
            }

            foreach (var dependency in dependencies.EnumerateArray())
            {
                if (dependency.ValueKind == JsonValueKind.Object
                    && dependency.TryGetProperty("UniqueID", out var uniqueId)
                    && uniqueId.ValueKind == JsonValueKind.String
                    && uniqueId.GetString() is { Length: > 0 } value)
                {
                    var isRequired = !dependency.TryGetProperty("IsRequired", out var required)
                        || required.ValueKind is not JsonValueKind.False;
                    result.Add(new(value, isRequired));
                }
            }
        }
        catch
        {
            // Invalid manifests are handled by the launcher.
        }

        return result
            .DistinctBy(dependency => dependency.UniqueId, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static ManifestAssemblyOwner? FindOwningManifest(string dll, List<ManifestAssemblyOwner> manifests)
    {
        var fullPath = Path.GetFullPath(dll);
        return manifests.FirstOrDefault(owner => ProbePathSafety.IsWithinOrEqual(owner.Directory, fullPath));
    }

    private sealed record AssemblyCandidate(string Path, AssemblyName Identity, string? OwnerUniqueId);
    private sealed record ManifestAssemblyOwner(string Directory, string UniqueId, string? EntryDllPath);
    private sealed record DeclaredDependency(string UniqueId, bool IsRequired);
}

internal sealed record ProbeDependencyMod(string UniqueId, string ModPath, string EntryDllPath);

internal static class ProbePathSafety
{
    public static StringComparer PathComparer => OperatingSystem.IsWindows()
        ? StringComparer.OrdinalIgnoreCase
        : StringComparer.Ordinal;

    public static string ResolveExistingRealPath(string path)
    {
        var fullPath = Path.GetFullPath(path);
        var pathRoot = Path.GetPathRoot(fullPath)
            ?? throw new InvalidOperationException($"Path does not have a root: {path}");
        var current = pathRoot;
        var remainder = fullPath[pathRoot.Length..];
        foreach (var segment in remainder.Split(
            [Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar],
            StringSplitOptions.RemoveEmptyEntries))
        {
            var next = Path.Combine(current, segment);
            FileSystemInfo info = Directory.Exists(next)
                ? new DirectoryInfo(next)
                : new FileInfo(next);
            if (!info.Exists)
            {
                throw new FileNotFoundException($"Path does not exist: {next}", next);
            }

            if ((info.Attributes & FileAttributes.ReparsePoint) != 0)
            {
                info = info.ResolveLinkTarget(returnFinalTarget: true)
                    ?? throw new IOException($"Could not resolve link target: {next}");
            }
            current = Path.GetFullPath(info.FullName);
        }

        return Path.GetFullPath(current);
    }

    public static bool TryResolveFileWithinRoot(
        string root,
        string candidate,
        out string resolved,
        out string? error)
    {
        resolved = "";
        error = null;
        try
        {
            var realRoot = ResolveExistingRealPath(root);
            var realCandidate = ResolveExistingRealPath(candidate);
            if (!File.Exists(realCandidate))
            {
                error = $"File does not exist: {candidate}";
                return false;
            }
            if (!IsWithin(realRoot, realCandidate))
            {
                error = $"File resolves outside the allowed root: {candidate} -> {realCandidate}";
                return false;
            }

            resolved = realCandidate;
            return true;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or ArgumentException)
        {
            error = ex.Message;
            return false;
        }
    }

    public static bool TryResolveRelativeFileWithinRoot(
        string root,
        string relativePath,
        out string resolved,
        out string? error)
    {
        resolved = "";
        error = null;
        if (string.IsNullOrWhiteSpace(relativePath))
        {
            error = "File path must not be empty.";
            return false;
        }
        if (Path.IsPathRooted(relativePath))
        {
            error = $"File path must be relative to the allowed root: {relativePath}";
            return false;
        }
        if (relativePath
            .Split(
                [Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar],
                StringSplitOptions.RemoveEmptyEntries)
            .Any(segment => segment == ".."))
        {
            error = $"File path must not contain parent traversal: {relativePath}";
            return false;
        }

        try
        {
            var realRoot = ResolveExistingRealPath(root);
            var candidate = Path.GetFullPath(Path.Combine(realRoot, relativePath));
            if (!IsWithin(realRoot, candidate))
            {
                error = $"File path escapes the allowed root: {relativePath}";
                return false;
            }
            if (!File.Exists(candidate))
            {
                return false;
            }

            return TryResolveFileWithinRoot(realRoot, candidate, out resolved, out error);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or ArgumentException)
        {
            error = ex.Message;
            return false;
        }
    }

    public static bool IsWithinOrEqual(string root, string candidate)
    {
        var relative = Path.GetRelativePath(root, candidate);
        return relative == "." || IsSafeRelativePath(relative);
    }

    public static bool IsWithin(string root, string candidate)
    {
        var relative = Path.GetRelativePath(root, candidate);
        return relative != "." && IsSafeRelativePath(relative);
    }

    public static IEnumerable<string> EnumerateDlls(string root, int limit)
    {
        return EnumerateFiles(
            root,
            path => Path.GetExtension(path).Equals(".dll", StringComparison.OrdinalIgnoreCase),
            limit);
    }

    public static IEnumerable<string> EnumerateNamedFiles(string root, string fileName, int limit)
    {
        return EnumerateFiles(
            root,
            path => Path.GetFileName(path).Equals(fileName, StringComparison.OrdinalIgnoreCase),
            limit);
    }

    private static IEnumerable<string> EnumerateFiles(
        string root,
        Func<string, bool> include,
        int limit)
    {
        var realRoot = ResolveExistingRealPath(root);
        var pending = new Stack<string>();
        pending.Push(realRoot);
        var yielded = 0;
        while (pending.Count > 0 && yielded < limit)
        {
            var directory = pending.Pop();
            IEnumerable<string> entries;
            try
            {
                entries = Directory.EnumerateFileSystemEntries(directory)
                    .OrderBy(path => path, PathComparer)
                    .ToList();
            }
            catch
            {
                continue;
            }

            foreach (var entry in entries)
            {
                FileAttributes attributes;
                try
                {
                    attributes = File.GetAttributes(entry);
                }
                catch
                {
                    continue;
                }
                if ((attributes & FileAttributes.ReparsePoint) != 0)
                {
                    continue;
                }
                if ((attributes & FileAttributes.Directory) != 0)
                {
                    pending.Push(entry);
                    continue;
                }
                if (!include(entry))
                {
                    continue;
                }

                yielded++;
                yield return Path.GetFullPath(entry);
                if (yielded >= limit)
                {
                    yield break;
                }
            }
        }
    }

    private static bool IsSafeRelativePath(string relative)
    {
        return !Path.IsPathRooted(relative)
            && relative != ".."
            && !relative.StartsWith($"..{Path.DirectorySeparatorChar}", StringComparison.Ordinal)
            && !relative.StartsWith($"..{Path.AltDirectorySeparatorChar}", StringComparison.Ordinal);
    }
}

internal static class ProbeAssemblyIdentity
{
    public static bool TryValidateCandidate(
        string sourceRoot,
        string candidate,
        AssemblyName requested,
        out string resolved,
        out string? rejection)
    {
        resolved = "";
        rejection = null;
        if (!File.Exists(candidate))
        {
            return false;
        }
        if (!ProbePathSafety.TryResolveFileWithinRoot(sourceRoot, candidate, out resolved, out var pathError))
        {
            rejection = $"Rejected assembly candidate {candidate}: {pathError}";
            return false;
        }

        try
        {
            var identity = AssemblyName.GetAssemblyName(resolved);
            if (CompatibilityScore(requested, identity) == 0)
            {
                rejection = $"Rejected incompatible assembly {identity.FullName} for {requested.FullName}: {resolved}";
                resolved = "";
                return false;
            }
            return true;
        }
        catch (Exception ex)
        {
            rejection = $"Rejected invalid managed assembly {candidate}: {ex.GetBaseException().Message}";
            resolved = "";
            return false;
        }
    }

    public static int CompatibilityScore(AssemblyName requested, AssemblyName candidate)
    {
        if (!string.Equals(requested.Name, candidate.Name, StringComparison.OrdinalIgnoreCase)
            || !CultureMatches(requested, candidate)
            || !PublicKeyTokensMatch(requested, candidate))
        {
            return 0;
        }

        if (requested.Version is null || requested.Version == new Version())
        {
            return 1;
        }
        if (candidate.Version == requested.Version)
        {
            return 4;
        }
        return candidate.Version is not null
            && candidate.Version.Major == requested.Version.Major
            && candidate.Version >= requested.Version
                ? 2
                : 0;
    }

    private static bool CultureMatches(AssemblyName requested, AssemblyName candidate)
    {
        return string.IsNullOrWhiteSpace(requested.CultureName)
            || string.Equals(requested.CultureName, candidate.CultureName, StringComparison.OrdinalIgnoreCase);
    }

    private static bool PublicKeyTokensMatch(AssemblyName requested, AssemblyName candidate)
    {
        var requestedToken = requested.GetPublicKeyToken();
        if (requestedToken is null || requestedToken.Length == 0)
        {
            return true;
        }
        return candidate.GetPublicKeyToken() is { Length: > 0 } candidateToken
            && requestedToken.SequenceEqual(candidateToken);
    }
}

internal sealed class ProbeLocalAssemblyIndex
{
    private readonly Dictionary<string, List<LocalAssemblyCandidate>> byName;

    private ProbeLocalAssemblyIndex(string root, Dictionary<string, List<LocalAssemblyCandidate>> byName)
    {
        Root = root;
        this.byName = byName;
    }

    public string Root { get; }

    public static ProbeLocalAssemblyIndex Build(string root)
    {
        var realRoot = ProbePathSafety.ResolveExistingRealPath(root);
        Dictionary<string, List<LocalAssemblyCandidate>> byName = new(StringComparer.OrdinalIgnoreCase);
        foreach (var dll in ProbePathSafety.EnumerateDlls(realRoot, 512))
        {
            try
            {
                var identity = AssemblyName.GetAssemblyName(dll);
                if (string.IsNullOrWhiteSpace(identity.Name))
                {
                    continue;
                }
                if (!byName.TryGetValue(identity.Name, out var candidates))
                {
                    candidates = [];
                    byName[identity.Name] = candidates;
                }
                candidates.Add(new(dll, identity));
            }
            catch
            {
                // Native and malformed DLLs aren't assembly resolution candidates.
            }
        }
        return new(realRoot, byName);
    }

    public bool TryResolve(
        AssemblyName requested,
        string? preferredDirectory,
        out string path,
        out string? detail)
    {
        path = "";
        detail = null;
        if (string.IsNullOrWhiteSpace(requested.Name)
            || !byName.TryGetValue(requested.Name, out var candidates))
        {
            return false;
        }

        var compatible = candidates
            .Select(candidate => (Candidate: candidate, Score: ProbeAssemblyIdentity.CompatibilityScore(requested, candidate.Identity)))
            .Where(candidate => candidate.Score > 0)
            .ToList();
        if (compatible.Count == 0)
        {
            detail = $"No compatible bundled assembly was found for {requested.FullName}.";
            return false;
        }

        if (!string.IsNullOrWhiteSpace(preferredDirectory))
        {
            var realPreferred = ProbePathSafety.ResolveExistingRealPath(preferredDirectory);
            var colocated = compatible
                .Where(candidate => ProbePathSafety.PathComparer.Equals(
                    Path.GetDirectoryName(candidate.Candidate.Path),
                    realPreferred))
                .ToList();
            if (colocated.Count > 0)
            {
                compatible = colocated;
            }
        }

        var bestScore = compatible.Max(candidate => candidate.Score);
        var bestVersion = compatible
            .Where(candidate => candidate.Score == bestScore)
            .Max(candidate => candidate.Candidate.Identity.Version ?? new Version());
        var best = compatible
            .Where(candidate => candidate.Score == bestScore
                && (candidate.Candidate.Identity.Version ?? new Version()) == bestVersion)
            .Select(candidate => candidate.Candidate)
            .DistinctBy(candidate => candidate.Path, ProbePathSafety.PathComparer)
            .ToList();
        if (best.Count != 1)
        {
            detail = $"Skipped ambiguous bundled assembly {requested.FullName}: {string.Join(", ", best.Select(candidate => candidate.Path))}.";
            return false;
        }

        path = best[0].Path;
        detail = $"Resolved compatible bundled assembly {requested.Name} from {path}.";
        return true;
    }

    private sealed record LocalAssemblyCandidate(string Path, AssemblyName Identity);
}
