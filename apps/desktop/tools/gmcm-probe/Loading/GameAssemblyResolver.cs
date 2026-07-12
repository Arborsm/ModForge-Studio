internal static class GameAssemblyResolver
{
    private static readonly object SyncRoot = new();
    private static readonly Assembly HarmonyShimAssembly = typeof(HarmonyLib.Harmony).Assembly;
    private static string? modPath;
    private static List<string> directories = [];
    private static ProbeLocalAssemblyIndex? localAssemblies;
    private static Lazy<DependencyAssemblyIndex>? dependencyAssemblies;

    public static void Install(ProbeRequest request)
    {
        lock (SyncRoot)
        {
            modPath = ProbePathSafety.ResolveExistingRealPath(request.ModPath);
            localAssemblies = ProbeLocalAssemblyIndex.Build(modPath);
            directories = ProbeAssemblyLoadContext.ResolveGameAssemblyDirectories(
                ProbeAssemblyLoadContext.ResolveGamePath(request.ModPath, request.GamePath));
            dependencyAssemblies = new(
                () => DependencyAssemblyIndex.Build(request.ModPath),
                LazyThreadSafetyMode.ExecutionAndPublication);
            AppDomain.CurrentDomain.AssemblyResolve -= Resolve;
            AppDomain.CurrentDomain.AssemblyResolve += Resolve;
            AssemblyLoadContext.Default.Resolving -= ResolveDefaultContext;
            AssemblyLoadContext.Default.Resolving += ResolveDefaultContext;
        }
    }

    private static Assembly? Resolve(object? sender, ResolveEventArgs args)
    {
        var assemblyName = new AssemblyName(args.Name);
        if (ProbeAssemblyLoadContext.IsHarmonyAssembly(assemblyName))
        {
            return HarmonyShimAssembly;
        }

        var name = assemblyName.Name;
        if (string.IsNullOrWhiteSpace(name))
        {
            return null;
        }

        var path = ResolvePath(assemblyName);
        return path is null ? null : AssemblyLoadContext.Default.LoadFromAssemblyPath(path);
    }

    private static Assembly? ResolveDefaultContext(AssemblyLoadContext context, AssemblyName assemblyName)
    {
        if (ProbeAssemblyLoadContext.IsHarmonyAssembly(assemblyName))
        {
            return HarmonyShimAssembly;
        }

        if (string.IsNullOrWhiteSpace(assemblyName.Name))
        {
            return null;
        }

        var path = ResolvePath(assemblyName);
        return path is null ? null : context.LoadFromAssemblyPath(path);
    }

    private static string? ResolvePath(AssemblyName assemblyName)
    {
        if (string.IsNullOrWhiteSpace(assemblyName.Name))
        {
            return null;
        }

        if (modPath is not null
            && localAssemblies is not null
            && localAssemblies.TryResolve(assemblyName, preferredDirectory: null, out var local, out _))
        {
            return local;
        }

        foreach (var directory in directories)
        {
            var candidate = Path.Combine(directory, $"{assemblyName.Name}.dll");
            if (ProbeAssemblyIdentity.TryValidateCandidate(
                directory,
                candidate,
                assemblyName,
                out var resolved,
                out _))
            {
                return resolved;
            }
        }

        if (dependencyAssemblies is null
            || !dependencyAssemblies.Value.TryResolve(assemblyName, out var dependencyDll, out _)
            || dependencyAssemblies.Value.ModsRoot is not { Length: > 0 } modsRoot
            || !ProbeAssemblyIdentity.TryValidateCandidate(
                modsRoot,
                dependencyDll,
                assemblyName,
                out var resolvedDependency,
                out _))
        {
            return null;
        }

        return resolvedDependency;
    }
}
