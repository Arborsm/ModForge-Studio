internal static class HeadlessEntryRunner
{
    private const int MaxBootstrapDependencies = 4;

    public static void Run(string dll, ProbeRequest request, ProbeState state, CancellationToken cancellationToken)
    {
        Exception? originalFailure = null;
        var realAttempt = GmcmCapture.BeginAttempt(state);
        try
        {
            RunAttempt(dll, request, state, cancellationToken, preferBundledSmapi: false);
            return;
        }
        catch (OperationCanceledException)
        {
            GmcmCapture.RollBack(state, realAttempt);
            throw;
        }
        catch (Exception ex)
        {
            GmcmCapture.RollBack(state, realAttempt);
            originalFailure = ex;
            var root = ex.GetBaseException();
            if (!HasInstalledSmapi(request) || !IsSmapiCompatibilityFailure(ex))
            {
                WarnFailure(dll, root, state);
                return;
            }

            state.NoteAssemblyLoad($"{Path.GetFileName(dll)} real SMAPI headless path failed ({root.GetType().Name}: {root.Message}); retrying with the bundled compatibility shim.");
        }

        var shimAttempt = GmcmCapture.BeginAttempt(state);
        try
        {
            RunAttempt(dll, request, state, cancellationToken, preferBundledSmapi: true);
        }
        catch (OperationCanceledException)
        {
            GmcmCapture.RollBack(state, shimAttempt);
            throw;
        }
        catch (Exception retryException)
        {
            GmcmCapture.RollBack(state, shimAttempt);
            var originalRoot = originalFailure!.GetBaseException();
            var retryRoot = retryException.GetBaseException();
            state.FailureStage ??= "headless-entry";
            state.Warn($"{Path.GetFileName(dll)} headless GMCM probe failed with real SMAPI: {FormatException(originalRoot)}; bundled shim retry also failed: {FormatException(retryRoot)}");
        }
    }

    private static void RunAttempt(
        string dll,
        ProbeRequest request,
        ProbeState state,
        CancellationToken cancellationToken,
        bool preferBundledSmapi)
    {
        var loadContext = new ProbeAssemblyLoadContext(Path.GetDirectoryName(dll)!, request.GamePath, state, preferBundledSmapi);
        var assembly = loadContext.LoadFromAssemblyPath(Path.GetFullPath(dll));
        if (ShouldSkipHeadlessEntry(assembly, state))
        {
            return;
        }

        var dependencyRuntimes = BootstrapDeclaredDependencies(assembly, loadContext, state);

        var modTypes = SafeGetTypes(assembly)
            .Where(type => type is { IsAbstract: false } && IsSmapiModType(type))
            .ToList();
        if (modTypes.Count == 0)
        {
            var typeSummary = string.Join(
                ", ",
                SafeGetTypes(assembly)
                    .Take(8)
                    .Select(type => $"{type.FullName} : {type.BaseType?.FullName ?? "<none>"}"));
            state.Warn($"{Path.GetFileName(dll)} does not contain a SMAPI Mod subclass recognized by the probe. Types: {typeSummary}");
            return;
        }

        foreach (var modType in modTypes)
        {
            cancellationToken.ThrowIfCancellationRequested();
            state.SmapiModsFound++;
            RunModEntry(modType, loadContext, state, dependencyRuntimes);
        }
    }

    private static IReadOnlyList<DependencyRuntime> BootstrapDeclaredDependencies(
        Assembly targetAssembly,
        ProbeAssemblyLoadContext loadContext,
        ProbeState targetState)
    {
        var dependencies = loadContext.GetBootstrapDependencies(targetAssembly);
        if (dependencies.Count > MaxBootstrapDependencies)
        {
            targetState.NoteAssemblyLoad(
                $"Headless dependency bootstrap limited to {MaxBootstrapDependencies} of {dependencies.Count} eligible required dependencies.");
        }

        List<DependencyRuntime> runtimes = [];
        foreach (var dependency in dependencies.Take(MaxBootstrapDependencies))
        {
            try
            {
                var dependencyAssembly = loadContext.LoadFromAssemblyPath(Path.GetFullPath(dependency.EntryDllPath));
                var modTypes = SafeGetTypes(dependencyAssembly)
                    .Where(type => type is { IsAbstract: false } && IsSmapiModType(type))
                    .OrderBy(type => type.FullName, StringComparer.Ordinal)
                    .ToList();
                if (modTypes.Count == 0)
                {
                    targetState.NoteAssemblyLoad(
                        $"Required dependency {dependency.UniqueId} was not bootstrapped because its EntryDll contains no SMAPI Mod subclass.");
                    continue;
                }

                foreach (var modType in modTypes)
                {
                    var dependencyState = new ProbeState(dependency.ModPath);
                    var mod = Activator.CreateInstance(modType)
                        ?? throw new InvalidOperationException($"{modType.FullName} could not be instantiated.");
                    var helperBundle = PrepareMod(
                        modType,
                        mod,
                        loadContext,
                        dependencyState,
                        targetState);
                    var entry = modType.GetMethod("Entry", BindingFlags.Public | BindingFlags.Instance)
                        ?? throw new MissingMethodException($"{modType.FullName} does not expose an Entry method.");
                    entry.Invoke(mod, [helperBundle.Helper]);
                    runtimes.Add(new(dependency.UniqueId, helperBundle));
                    CopyDependencyDiagnostics(dependency.UniqueId, dependencyState, targetState);
                }

                targetState.NoteAssemblyLoad(
                    $"Bootstrapped required dependency {dependency.UniqueId} for headless lifecycle events.");
            }
            catch (Exception ex)
            {
                targetState.NoteAssemblyLoad(
                    $"Required dependency {dependency.UniqueId} bootstrap was ignored: {FormatException(ex.GetBaseException())}");
            }
        }

        return runtimes;
    }

    private static void CopyDependencyDiagnostics(
        string uniqueId,
        ProbeState dependencyState,
        ProbeState targetState)
    {
        foreach (var warning in dependencyState.AssemblyLoadWarnings)
        {
            targetState.NoteAssemblyLoad($"{uniqueId}: {warning}");
        }
    }

    private static bool ShouldSkipHeadlessEntry(Assembly assembly, ProbeState state)
    {
        var references = assembly.GetReferencedAssemblies();
        var referencesRuntimeDetour = references.Any(reference =>
            reference.Name?.Contains("MonoMod.RuntimeDetour", StringComparison.OrdinalIgnoreCase) == true);
        if (referencesRuntimeDetour)
        {
            state.NoteAssemblyLoad($"{Path.GetFileName(assembly.Location)} headless GMCM probe skipped because it references MonoMod.RuntimeDetour; static/config fallbacks will be used.");
            return true;
        }

        var referencesHarmony = references.Any(reference =>
            reference.Name?.Equals("0Harmony", StringComparison.OrdinalIgnoreCase) == true
            || reference.Name?.Equals("HarmonyLib", StringComparison.OrdinalIgnoreCase) == true);
        if (referencesHarmony)
        {
            state.NoteAssemblyLoad($"{Path.GetFileName(assembly.Location)} references Harmony; headless GMCM probe will use the bundled no-op Harmony shim.");
        }

        return false;
    }

    private static bool IsSmapiModType(Type type)
    {
        for (var current = type.BaseType; current is not null; current = current.BaseType)
        {
            if (current.FullName == "StardewModdingAPI.Mod")
            {
                return true;
            }
        }
        return false;
    }

    private static Assembly ResolveModSmapiAssembly(Type modType, ProbeAssemblyLoadContext loadContext)
    {
        for (var current = modType.BaseType; current is not null; current = current.BaseType)
        {
            if (current.FullName == "StardewModdingAPI.Mod")
            {
                return current.Assembly;
            }
        }

        return loadContext.SmapiAssembly;
    }

    private static void RunModEntry(
        Type modType,
        ProbeAssemblyLoadContext loadContext,
        ProbeState state,
        IReadOnlyList<DependencyRuntime> dependencyRuntimes)
    {
        var standardCheckpoint = GmcmCapture.BeginAttempt(state);
        try
        {
            RunStandardModEntry(modType, loadContext, state, dependencyRuntimes);
            var captured = GmcmCapture.CapturedSince(state, standardCheckpoint);
            if (captured > 0)
            {
                GmcmCapture.Commit(state);
                state.CaptureStrategy = "headless-entry";
                state.FailureStage = null;
            }
            else
            {
                GmcmCapture.RollBack(state, standardCheckpoint);
                if (TryRunRegistrationFallbacks(
                    modType,
                    loadContext,
                    state,
                    out var metadataDetail,
                    out var directDetail,
                    out _))
                {
                    state.NoteAssemblyLoad(
                        $"{modType.FullName} normal headless Entry path completed without GMCM fields; {metadataDetail}; {directDetail}");
                    return;
                }
                state.NoteAssemblyLoad(
                    $"{modType.FullName} normal headless Entry path completed without GMCM fields; {metadataDetail}; {directDetail}");
            }
            return;
        }
        catch (Exception ex)
        {
            var root = ex.GetBaseException();
            var partialFields = GmcmCapture.CapturedSince(state, standardCheckpoint);
            GmcmCapture.RollBack(state, standardCheckpoint);
            if (partialFields > 0)
            {
                state.FailureStage ??= "headless-entry";
                state.NoteAssemblyLoad($"{modType.FullName} discarded {partialFields} GMCM field(s) because Entry failed: {root.GetType().Name}: {root.Message}");
            }

            if (TryRunRegistrationFallbacks(
                modType,
                loadContext,
                state,
                out var metadataDetail,
                out var directDetail,
                out var fallbackCompatibilityFailure))
            {
                state.NoteAssemblyLoad(
                    $"{modType.FullName} normal headless Entry path failed ({root.GetType().Name}: {root.Message}); {metadataDetail}; {directDetail}");
                return;
            }

            if (fallbackCompatibilityFailure is not null)
            {
                ex.Data["gmcm-probe-smapi-fallback-failure"] = fallbackCompatibilityFailure;
            }

            state.NoteAssemblyLoad(
                $"{modType.FullName} normal headless Entry path failed ({root.GetType().Name}: {root.Message}); {metadataDetail}; {directDetail}");

            throw;
        }
    }

    private static bool TryRunRegistrationFallbacks(
        Type modType,
        ProbeAssemblyLoadContext loadContext,
        ProbeState state,
        out string metadataDetail,
        out string directDetail,
        out Exception? compatibilityFailure)
    {
        metadataDetail = "metadata registration fallback was not completed.";
        directDetail = "direct GMCM registration fallback was not completed.";
        compatibilityFailure = null;
        try
        {
            if (TryRunMetadataRegistration(
                modType,
                loadContext,
                state,
                out metadataDetail,
                out var metadataCompatibilityFailure))
            {
                compatibilityFailure = metadataCompatibilityFailure;
                return true;
            }
            compatibilityFailure = metadataCompatibilityFailure;
        }
        catch (Exception metadataException)
        {
            var metadataRoot = metadataException.GetBaseException();
            metadataDetail = $"metadata registration fallback failed: {metadataRoot.GetType().Name}: {metadataRoot.Message}";
            if (IsSmapiCompatibilityFailure(metadataException))
            {
                compatibilityFailure = metadataException;
            }
        }

        try
        {
            if (TryRunDirectGmcmRegistration(
                modType,
                state,
                out directDetail,
                out var directCompatibilityFailure))
            {
                compatibilityFailure = directCompatibilityFailure ?? compatibilityFailure;
                return true;
            }
            compatibilityFailure = directCompatibilityFailure ?? compatibilityFailure;
        }
        catch (Exception directException)
        {
            var directRoot = directException.GetBaseException();
            directDetail = $"direct GMCM registration fallback failed: {directRoot.GetType().Name}: {directRoot.Message}";
            if (compatibilityFailure is null && IsSmapiCompatibilityFailure(directException))
            {
                compatibilityFailure = directException;
            }
        }
        return false;
    }

    private static bool TryRunMetadataRegistration(
        Type modType,
        ProbeAssemblyLoadContext loadContext,
        ProbeState state,
        out string detail,
        out Exception? compatibilityFailure)
    {
        detail = "no metadata registration candidate was found.";
        compatibilityFailure = null;
        var candidates = state.RegistrationCandidates
            .Where(candidate => candidate.EntryType.Equals(modType.FullName, StringComparison.Ordinal))
            .OrderByDescending(candidate => candidate.MethodName.Equals(".ctor", StringComparison.Ordinal))
            .ThenByDescending(candidate => candidate.ParameterTypes.Any(IsGmcmTypeName))
            .ThenByDescending(candidate => candidate.MethodName.Contains("Config", StringComparison.OrdinalIgnoreCase)
                || candidate.MethodName.Contains("Menu", StringComparison.OrdinalIgnoreCase))
            .ThenBy(candidate => candidate.SourcePath, ProbePathSafety.PathComparer)
            .ThenBy(candidate => candidate.MetadataToken)
            .ToList();
        if (candidates.Count == 0)
        {
            return false;
        }

#pragma warning disable SYSLIB0050
        var mod = FormatterServices.GetUninitializedObject(modType);
#pragma warning restore SYSLIB0050
        var helperBundle = PrepareMod(modType, mod, loadContext, state);
        InitializeConfigMembers(modType, mod, state);

        List<string> failures = [];
        Dictionary<Type, object> constructedTargets = [];
        HashSet<Assembly> initializedCandidateAssemblies = [];
        foreach (var candidate in candidates)
        {
            MethodBase? method;
            try
            {
                var candidateAssembly = loadContext.LoadBundledAssembly(candidate.SourcePath);
                if (initializedCandidateAssemblies.Add(candidateAssembly))
                {
                    InitializeCandidateStaticMembers(candidateAssembly, mod, helperBundle, state);
                }
                method = candidateAssembly.ManifestModule.ResolveMethod(candidate.MetadataToken);
                if (method is not null
                    && (!method.Name.Equals(candidate.MethodName, StringComparison.Ordinal)
                        || !string.Equals(method.DeclaringType?.FullName, candidate.DeclaringType, StringComparison.Ordinal)))
                {
                    failures.Add(
                        $"{candidate.DeclaringType}.{candidate.MethodName}: resolved metadata token no longer matches the inspected method");
                    continue;
                }
            }
            catch (Exception ex)
            {
                failures.Add(
                    $"{candidate.SourceAssembly}:{candidate.DeclaringType}.{candidate.MethodName}: {FormatException(ex.GetBaseException())}");
                continue;
            }

            if (method is null || method.ContainsGenericParameters)
            {
                continue;
            }

            if (!TryCreateCandidateTarget(method, mod, constructedTargets, out var target))
            {
                failures.Add($"{candidate.DeclaringType}.{candidate.MethodName}: declaring type could not be instantiated");
                continue;
            }
            if (!TryCreateCandidateArguments(method, mod, helperBundle, state, out var arguments, out var unsupportedParameter))
            {
                if (unsupportedParameter is not null)
                {
                    failures.Add($"{candidate.DeclaringType}.{candidate.MethodName}: unsupported parameter {unsupportedParameter}");
                }
                continue;
            }

            var checkpoint = GmcmCapture.BeginAttempt(state);
            var completed = true;
            try
            {
                object? invocationResult = method switch
                {
                    ConstructorInfo constructor => constructor.Invoke(arguments),
                    MethodInfo candidateMethod => candidateMethod.Invoke(target, arguments),
                    _ => null,
                };
                if (method is ConstructorInfo && invocationResult is not null)
                {
                    constructedTargets[invocationResult.GetType()] = invocationResult;
                }
                if (GmcmCapture.CapturedSince(state, checkpoint) > 0)
                {
                    GmcmCapture.Commit(state);
                }
            }
            catch (Exception ex)
            {
                completed = false;
                var root = ex.GetBaseException();
                failures.Add($"{candidate.DeclaringType}.{candidate.MethodName}: {FormatException(root)}");
                if (compatibilityFailure is null && IsSmapiCompatibilityFailure(ex))
                {
                    compatibilityFailure = ex;
                }
            }

            if (!completed)
            {
                GmcmCapture.RollBack(state, checkpoint);
                continue;
            }

            var captured = GmcmCapture.CapturedSince(state, checkpoint);
            if (captured > 0)
            {
                state.CaptureStrategy = "metadata-registration";
                state.FailureStage = null;
                detail = $"{modType.FullName} captured {captured} GMCM field(s) through metadata registration candidate {candidate.DeclaringType}.{candidate.MethodName}.";
                if (failures.Count > 0)
                {
                    detail += $" Earlier candidate failures: {string.Join("; ", failures)}";
                }
                return true;
            }
            GmcmCapture.RollBack(state, checkpoint);
        }

        detail = failures.Count == 0
            ? $"{modType.FullName} metadata registration candidates completed without capturing fields."
            : $"{modType.FullName} metadata registration candidates did not capture fields: {string.Join("; ", failures)}";
        return false;
    }

    internal static void InitializeCandidateStaticMembers(
        Assembly candidateAssembly,
        object mod,
        RuntimeHelperBundle helperBundle,
        ProbeState state)
    {
        var manifest = FindInstanceProperty(mod.GetType(), "ModManifest")?.GetValue(mod);
        foreach (var type in SafeGetTypes(candidateAssembly))
        {
            try
            {
                foreach (var field in type.GetFields(BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic))
                {
                    if (field.IsLiteral
                        || field.IsInitOnly
                        || !CanInitializeStaticRuntimeMember(
                            field.Name,
                            field.FieldType,
                            manifest,
                            helperBundle))
                    {
                        continue;
                    }
                    try
                    {
                        if (field.GetValue(null) is null
                            && CreateStaticRuntimeValue(
                                field.Name,
                                field.FieldType,
                                manifest,
                                helperBundle,
                                state) is { } value)
                        {
                            field.SetValue(null, value);
                        }
                    }
                    catch (Exception ex)
                    {
                        state.NoteAssemblyLoad(
                            $"{type.FullName}.{field.Name} could not be initialized for metadata registration: {ex.GetBaseException().Message}");
                    }
                }

                foreach (var property in type.GetProperties(BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic))
                {
                    if (!property.CanRead
                        || !property.CanWrite
                        || property.GetIndexParameters().Length != 0
                        || !CanInitializeStaticRuntimeMember(
                            property.Name,
                            property.PropertyType,
                            manifest,
                            helperBundle))
                    {
                        continue;
                    }
                    try
                    {
                        if (property.GetValue(null) is null
                            && CreateStaticRuntimeValue(
                                property.Name,
                                property.PropertyType,
                                manifest,
                                helperBundle,
                                state) is { } value)
                        {
                            property.SetValue(null, value);
                        }
                    }
                    catch (Exception ex)
                    {
                        state.NoteAssemblyLoad(
                            $"{type.FullName}.{property.Name} could not be initialized for metadata registration: {ex.GetBaseException().Message}");
                    }
                }
            }
            catch (Exception ex)
            {
                state.NoteAssemblyLoad(
                    $"{type.FullName} static metadata could not be inspected for registration state injection: {ex.GetBaseException().Message}");
            }
        }
    }

    private static bool CanInitializeStaticRuntimeMember(
        string memberName,
        Type memberType,
        object? manifest,
        RuntimeHelperBundle helperBundle)
    {
        var normalizedName = memberName.TrimStart('_');
        return ((normalizedName.Equals("Helper", StringComparison.OrdinalIgnoreCase)
                    || normalizedName.Equals("ModHelper", StringComparison.OrdinalIgnoreCase))
                && memberType.IsInstanceOfType(helperBundle.Helper))
            || ((normalizedName.Equals("Monitor", StringComparison.OrdinalIgnoreCase)
                    || normalizedName.Equals("ModMonitor", StringComparison.OrdinalIgnoreCase))
                && memberType.IsInstanceOfType(helperBundle.Monitor))
            || ((normalizedName.Equals("Manifest", StringComparison.OrdinalIgnoreCase)
                    || normalizedName.Equals("ModManifest", StringComparison.OrdinalIgnoreCase))
                && manifest is not null
                && memberType.IsInstanceOfType(manifest))
            || normalizedName.EndsWith("Config", StringComparison.OrdinalIgnoreCase)
                && memberType.Name.Contains("Config", StringComparison.OrdinalIgnoreCase)
                && memberType is { IsClass: true, IsAbstract: false };
    }

    private static object? CreateStaticRuntimeValue(
        string memberName,
        Type memberType,
        object? manifest,
        RuntimeHelperBundle helperBundle,
        ProbeState state)
    {
        var normalizedName = memberName.TrimStart('_');
        if ((normalizedName.Equals("Helper", StringComparison.OrdinalIgnoreCase)
                || normalizedName.Equals("ModHelper", StringComparison.OrdinalIgnoreCase))
            && memberType.IsInstanceOfType(helperBundle.Helper))
        {
            return helperBundle.Helper;
        }
        if ((normalizedName.Equals("Monitor", StringComparison.OrdinalIgnoreCase)
                || normalizedName.Equals("ModMonitor", StringComparison.OrdinalIgnoreCase))
            && memberType.IsInstanceOfType(helperBundle.Monitor))
        {
            return helperBundle.Monitor;
        }
        if ((normalizedName.Equals("Manifest", StringComparison.OrdinalIgnoreCase)
                || normalizedName.Equals("ModManifest", StringComparison.OrdinalIgnoreCase))
            && manifest is not null
            && memberType.IsInstanceOfType(manifest))
        {
            return manifest;
        }
        if (normalizedName.EndsWith("Config", StringComparison.OrdinalIgnoreCase)
            && memberType.Name.Contains("Config", StringComparison.OrdinalIgnoreCase)
            && memberType is { IsClass: true, IsAbstract: false })
        {
            var config = RuntimeValueFactory.CreateConfigInstance(memberType, state.ModPath);
            if (config is not null)
            {
                RuntimeValueFactory.FillNullMembers(config);
            }
            return config;
        }

        return null;
    }

    private static bool TryCreateCandidateTarget(
        MethodBase method,
        object mod,
        IReadOnlyDictionary<Type, object> constructedTargets,
        out object? target)
    {
        target = null;
        if (method is ConstructorInfo)
        {
            return true;
        }
        if (method.IsStatic)
        {
            return true;
        }
        if (method.DeclaringType?.IsInstanceOfType(mod) == true)
        {
            target = mod;
            return true;
        }
        if (method.DeclaringType is not null
            && constructedTargets.TryGetValue(method.DeclaringType, out target))
        {
            return true;
        }

        target = method.DeclaringType is null
            ? null
            : RuntimeValueFactory.CreateDefaultInstance(method.DeclaringType);
        return target is not null;
    }

    private static bool TryCreateCandidateArguments(
        MethodBase method,
        object mod,
        RuntimeHelperBundle helperBundle,
        ProbeState state,
        out object?[] arguments,
        out string? unsupportedParameter)
    {
        var parameters = method.GetParameters();
        arguments = new object?[parameters.Length];
        unsupportedParameter = null;
        for (var index = 0; index < parameters.Length; index++)
        {
            var parameter = parameters[index];
            var type = parameter.ParameterType;
            if (type.IsInstanceOfType(mod))
            {
                arguments[index] = mod;
            }
            else if (IsGmcmApi(type))
            {
                arguments[index] = RuntimeGmcmApiProxy.Create(type, state);
            }
            else if (type.IsInstanceOfType(helperBundle.Helper))
            {
                arguments[index] = helperBundle.Helper;
            }
            else if (type.IsInstanceOfType(helperBundle.Monitor))
            {
                arguments[index] = helperBundle.Monitor;
            }
            else if (type.IsInterface && TryGetAssignableHelperProperty(helperBundle.Helper, type, out var helperProperty))
            {
                arguments[index] = helperProperty;
            }
            else if (type.FullName is "StardewModdingAPI.IManifest")
            {
                arguments[index] = FindInstanceProperty(mod.GetType(), "ModManifest")?.GetValue(mod);
            }
            else if (type == typeof(string))
            {
                if (parameter.HasDefaultValue)
                {
                    arguments[index] = parameter.DefaultValue;
                    continue;
                }
                unsupportedParameter = parameter.Name ?? type.FullName ?? type.Name;
                return false;
            }
            else if (type.Name.Contains("Config", StringComparison.OrdinalIgnoreCase))
            {
                arguments[index] = RuntimeValueFactory.CreateConfigInstance(type, state.ModPath);
                if (arguments[index] is not null)
                {
                    RuntimeValueFactory.FillNullMembers(arguments[index]!);
                }
            }
            else if (typeof(Delegate).IsAssignableFrom(type))
            {
                arguments[index] = RuntimeValueFactory.CreateDelegate(type, state.ModPath);
                if (arguments[index] is null)
                {
                    unsupportedParameter = type.FullName ?? type.Name;
                    return false;
                }
            }
            else if (typeof(EventArgs).IsAssignableFrom(type) || type == typeof(object))
            {
                arguments[index] = type == typeof(object) ? null : RuntimeValueFactory.CreateDefaultInstance(type);
            }
            else if (parameter.HasDefaultValue)
            {
                arguments[index] = parameter.DefaultValue;
            }
            else if (Nullable.GetUnderlyingType(type) is not null)
            {
                arguments[index] = null;
            }
            else if (type.IsClass && !type.IsAbstract)
            {
                arguments[index] = RuntimeValueFactory.CreateDefaultInstance(type);
                if (arguments[index] is null)
                {
                    unsupportedParameter = type.FullName ?? type.Name;
                    return false;
                }
                RuntimeValueFactory.FillNullMembers(arguments[index]!);
            }
            else
            {
                unsupportedParameter = type.FullName ?? type.Name;
                return false;
            }
        }

        return true;
    }

    private static bool TryGetAssignableHelperProperty(object helper, Type targetType, out object? value)
    {
        foreach (var contract in helper.GetType().GetInterfaces())
        {
            foreach (var property in contract.GetProperties())
            {
                if (!targetType.IsAssignableFrom(property.PropertyType))
                {
                    continue;
                }
                try
                {
                    value = property.GetValue(helper);
                    if (value is not null && targetType.IsInstanceOfType(value))
                    {
                        return true;
                    }
                }
                catch
                {
                    // A missing optional helper property should not block other compatible properties.
                }
            }
        }

        value = null;
        return false;
    }

    private static bool IsGmcmTypeName(string typeName)
    {
        return typeName.Contains("GenericModConfigMenu", StringComparison.OrdinalIgnoreCase);
    }

    private static void RunStandardModEntry(
        Type modType,
        ProbeAssemblyLoadContext loadContext,
        ProbeState state,
        IReadOnlyList<DependencyRuntime> dependencyRuntimes)
    {
        var mod = Activator.CreateInstance(modType) ?? throw new InvalidOperationException($"{modType.FullName} could not be instantiated.");
        var helperBundle = PrepareMod(modType, mod, loadContext, state);

        var entry = modType.GetMethod("Entry", BindingFlags.Public | BindingFlags.Instance);
        if (entry is null)
        {
            throw new MissingMethodException($"{modType.FullName} does not expose an Entry method.");
        }
        entry.Invoke(mod, [helperBundle.Helper]);
        foreach (var dependency in dependencyRuntimes)
        {
            try
            {
                RuntimeSmapiProxy.RaiseGameLaunched(dependency.HelperBundle.Helper);
            }
            catch (Exception ex)
            {
                state.NoteAssemblyLoad(
                    $"Required dependency {dependency.UniqueId} GameLaunched failed: {FormatException(ex.GetBaseException())}");
                throw;
            }
        }
        RuntimeSmapiProxy.RaiseGameLaunched(helperBundle.Helper);
    }

    private static bool TryRunDirectGmcmRegistration(
        Type modType,
        ProbeState state,
        out string detail,
        out Exception? compatibilityFailure)
    {
        detail = "no direct GMCM registration method was found.";
        compatibilityFailure = null;
        var candidates = FindDirectGmcmCandidates(modType, state);
        if (candidates.Count == 0)
        {
            return false;
        }

#pragma warning disable SYSLIB0050
        var mod = FormatterServices.GetUninitializedObject(modType);
#pragma warning restore SYSLIB0050
        InitializeConfigMembers(modType, mod, state);

        List<string> failures = [];
        foreach (var candidate in candidates)
        {
            var checkpoint = GmcmCapture.BeginAttempt(state);
            try
            {
                var api = RuntimeGmcmApiProxy.Create(candidate.Parameters[0].ParameterType, state);
                candidate.Method.Invoke(mod, [api]);
                if (GmcmCapture.CapturedSince(state, checkpoint) > 0)
                {
                    GmcmCapture.Commit(state);
                }
            }
            catch (Exception ex)
            {
                GmcmCapture.RollBack(state, checkpoint);
                var root = ex.GetBaseException();
                failures.Add($"{candidate.Method.Name}: {root.GetType().Name}: {root.Message}");
                if (compatibilityFailure is null && IsSmapiCompatibilityFailure(ex))
                {
                    compatibilityFailure = ex;
                }
                continue;
            }

            var candidateCaptured = GmcmCapture.CapturedSince(state, checkpoint);
            if (candidateCaptured > 0)
            {
                state.CaptureStrategy = "direct-registration";
                state.FailureStage = null;
                detail = $"captured {candidateCaptured} GMCM field(s) through direct registration fallback.";
                if (failures.Count > 0)
                {
                    detail += $" Earlier fallback failures: {string.Join("; ", failures)}";
                }
                return true;
            }
            GmcmCapture.RollBack(state, checkpoint);
        }

        detail = failures.Count > 0
            ? $"direct GMCM registration failed: {string.Join("; ", failures)}"
            : "direct GMCM registration completed without capturing fields.";
        return false;
    }

    private static List<(MethodInfo Method, ParameterInfo[] Parameters)> FindDirectGmcmCandidates(
        Type modType,
        ProbeState state)
    {
        var sourceAssembly = Path.GetFileName(modType.Assembly.Location);
        var reachableTokens = state.RegistrationCandidates
            .Where(candidate => candidate.EntryType.Equals(modType.FullName, StringComparison.Ordinal)
                && candidate.SourceAssembly.Equals(sourceAssembly, StringComparison.OrdinalIgnoreCase))
            .Select(candidate => candidate.MetadataToken)
            .ToHashSet();
        return modType
            .GetMethods(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance)
            .Select(method => (Method: method, Parameters: method.GetParameters()))
            .Where(candidate => reachableTokens.Contains(candidate.Method.MetadataToken)
                && candidate.Parameters.Length == 1
                && IsGmcmApi(candidate.Parameters[0].ParameterType))
            .ToList();
    }

    private static bool IsGmcmApi(Type type)
    {
        if (!type.IsInterface)
        {
            return false;
        }

        var methodNames = type.GetMethods().Select(method => method.Name).ToHashSet(StringComparer.Ordinal);
        return methodNames.Contains("Register")
            && methodNames.Any(name => name.StartsWith("Add", StringComparison.Ordinal) && name.EndsWith("Option", StringComparison.Ordinal));
    }

    private static void InitializeConfigMembers(Type modType, object mod, ProbeState state)
    {
        string[] conventionalNames = ["Config", "config", "_config", "ModConfig"];
        for (var current = modType; current is not null && current != typeof(object); current = current.BaseType)
        {
            foreach (var name in conventionalNames)
            {
                try
                {
                    var property = current.GetProperty(
                        name,
                        BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.DeclaredOnly);
                    if (property is { CanRead: true, CanWrite: true }
                        && property.GetIndexParameters().Length == 0
                        && property.GetValue(mod) is null)
                    {
                        SetConfigMember(property.PropertyType, value => property.SetValue(mod, value), state);
                    }
                }
                catch
                {
                    // A different member signature can reference a missing private runtime dependency.
                }

                try
                {
                    var field = current.GetField(
                        name,
                        BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.DeclaredOnly);
                    if (field is not null && field.GetValue(mod) is null)
                    {
                        SetConfigMember(field.FieldType, value => field.SetValue(mod, value), state);
                    }
                }
                catch
                {
                    // Keep probing other conventional config member names.
                }
            }
        }
    }

    private static void SetConfigMember(Type configType, Action<object> setter, ProbeState state)
    {
        var value = RuntimeValueFactory.CreateConfigInstance(configType, state.ModPath);
        if (value is null)
        {
            return;
        }

        RuntimeValueFactory.FillNullMembers(value);
        setter(value);
    }

    private static RuntimeHelperBundle PrepareMod(
        Type modType,
        object mod,
        ProbeAssemblyLoadContext loadContext,
        ProbeState state,
        ProbeState? eventState = null)
    {
        var smapiAssembly = ResolveModSmapiAssembly(modType, loadContext);
        object? manifest = null;
        if (FindInstanceProperty(modType, "ModManifest")?.PropertyType is { } manifestType)
        {
            manifest = RuntimeSmapiProxy.CreateManifest(manifestType, state.ModPath);
        }
        var helperBundle = RuntimeSmapiProxy.CreateHelper(smapiAssembly, state, manifest, eventState);
        if (manifest is not null)
        {
            SetProperty(modType, mod, "ModManifest", manifest, state);
        }
        SetProperty(modType, mod, "Helper", helperBundle.Helper, state);
        SetProperty(modType, mod, "Monitor", helperBundle.Monitor, state);
        WarnIfPropertyNull(modType, mod, "Helper", state);
        WarnIfPropertyNull(modType, mod, "Monitor", state);
        WarnIfPropertyNull(modType, mod, "ModManifest", state);
        return helperBundle;
    }

    private sealed record DependencyRuntime(string UniqueId, RuntimeHelperBundle HelperBundle);

    private static void SetProperty(Type type, object instance, string name, object value, ProbeState state)
    {
        var property = FindInstanceProperty(type, name);
        if (property is null)
        {
            return;
        }

        try
        {
            property.SetValue(instance, value);
        }
        catch (Exception ex)
        {
            if (SetBackingField(type, instance, name, value))
            {
                return;
            }

            state.NoteAssemblyLoad($"{type.FullName}.{name} could not be set in headless probe: {ex.GetBaseException().Message}");
        }
    }

    private static bool SetBackingField(Type type, object instance, string name, object value)
    {
        for (var current = type; current is not null; current = current.BaseType)
        {
            var field = current.GetField($"<{name}>k__BackingField", BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.DeclaredOnly);
            if (field is null)
            {
                continue;
            }

            field.SetValue(instance, value);
            return true;
        }

        return false;
    }

    private static void WarnIfPropertyNull(Type type, object instance, string name, ProbeState state)
    {
        try
        {
            var property = FindInstanceProperty(type, name);
            if (property is not null && property.GetValue(instance) is null)
            {
                state.NoteAssemblyLoad($"{type.FullName}.{name} remained null after headless injection.");
            }
        }
        catch (Exception ex)
        {
            state.NoteAssemblyLoad($"{type.FullName}.{name} could not be inspected after headless injection: {ex.GetBaseException().Message}");
        }
    }

    private static PropertyInfo? FindInstanceProperty(Type type, string name)
    {
        for (var current = type; current is not null; current = current.BaseType)
        {
            var property = current.GetProperty(name, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.DeclaredOnly);
            if (property is not null)
            {
                return property;
            }
        }

        return null;
    }

    private static bool IsSmapiCompatibilityFailure(Exception exception)
    {
        if (exception.Data["gmcm-probe-smapi-fallback-failure"] is Exception fallbackFailure
            && IsSmapiCompatibilityFailure(fallbackFailure))
        {
            return true;
        }

        for (var current = exception; current is not null; current = current.InnerException)
        {
            if (RuntimeProxy.IsLoaderCompatibilityFailure(current))
            {
                return true;
            }

            var detail = $"{current.Message}\n{current.StackTrace}";
            if (current is EntryPointNotFoundException
                && detail.Contains("IModLinked", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            if (current is MissingMethodException or MissingFieldException or TypeLoadException
                && (detail.Contains("StardewModdingAPI", StringComparison.OrdinalIgnoreCase)
                    || detail.Contains("SMAPI.Toolkit", StringComparison.OrdinalIgnoreCase)))
            {
                return true;
            }

            if (current is TypeLoadException
                && (detail.Contains("generatedProxy", StringComparison.OrdinalIgnoreCase)
                    || detail.Contains("ProxyBuilder", StringComparison.OrdinalIgnoreCase)
                    || detail.Contains("DispatchProxy", StringComparison.OrdinalIgnoreCase)))
            {
                return true;
            }
        }

        return false;
    }

    private static bool HasInstalledSmapi(ProbeRequest request)
    {
        var gamePath = ProbeAssemblyLoadContext.ResolveGamePath(request.ModPath, request.GamePath);
        return ProbeAssemblyLoadContext.ResolveGameAssemblyDirectories(gamePath)
            .Any(directory => File.Exists(Path.Combine(directory, "StardewModdingAPI.dll")));
    }

    private static void WarnFailure(string dll, Exception exception, ProbeState state)
    {
        state.FailureStage ??= "headless-entry";
        state.Warn($"{Path.GetFileName(dll)} headless GMCM probe failed: {FormatException(exception)}");
    }

    private static string FormatException(Exception exception)
    {
        var stack = exception.StackTrace?.Split(Environment.NewLine).FirstOrDefault()?.Trim();
        var detail = stack is null ? exception.Message : $"{exception.Message} ({stack})";
        return $"{exception.GetType().Name}: {detail}";
    }

    private static IEnumerable<Type> SafeGetTypes(Assembly assembly)
    {
        try
        {
            return assembly.GetTypes();
        }
        catch (ReflectionTypeLoadException ex)
        {
            if (ex.LoaderExceptions.Any(error => error is not null && RuntimeProxy.IsLoaderCompatibilityFailure(error)))
            {
                throw;
            }
            return ex.Types.Where(type => type is not null)!;
        }
    }
}
