internal static class RuntimeProxyHandlers
{
    public static object? InvokeHelper(RuntimeProxyContext context, MethodInfo method)
    {
        if (method.Name == "ReadConfig")
        {
            var configType = method.GetGenericArguments().FirstOrDefault() ?? method.ReturnType;
            var path = ResolveRuntimeFile(context.State!, "config.json");
            if (path is null)
            {
                return RuntimeValueFactory.CreateConfigFallback(configType);
            }

            try
            {
                var config = ProbeJson.Deserialize(File.ReadAllText(path), configType) ?? RuntimeValueFactory.CreateConfigFallback(configType);
                if (config is not null)
                {
                    RuntimeValueFactory.FillNullMembers(config);
                }
                return config;
            }
            catch (Exception ex)
            {
                context.State!.NoteAssemblyLoad($"config.json could not be deserialized as {configType.Name}; using a partial fallback: {ex.GetBaseException().Message}");
                return RuntimeValueFactory.CreateConfigFallbackWithJsonOverlay(configType, path);
            }
        }

        if (method.Name == "WriteConfig")
        {
            return null;
        }

        return RuntimeDefaultFactory.Create(method.ReturnType, context);
    }

    public static object? InvokeModRegistry(RuntimeProxyContext context, MethodInfo method, object?[] args)
    {
        var uniqueId = args.FirstOrDefault()?.ToString() ?? "";
        var isGmcm = uniqueId.Equals("spacechase0.GenericModConfigMenu", StringComparison.OrdinalIgnoreCase);
        var isCurrentMod = context.Manifest?.UniqueId.Equals(uniqueId, StringComparison.OrdinalIgnoreCase) == true;
        if (isGmcm)
        {
            context.State?.NoteGmcmInteraction();
        }
        if (method.Name == "IsLoaded")
        {
            return isGmcm || isCurrentMod || ExternalApiProfiles.Supports(uniqueId);
        }

        if (method.Name == "GetApi" && isGmcm)
        {
            var apiType = method.GetGenericArguments().FirstOrDefault() ?? method.ReturnType;
            return RuntimeGmcmApiProxy.Create(apiType, context.State!);
        }

        if (method.Name == "GetApi")
        {
            var apiType = method.GetGenericArguments().FirstOrDefault() ?? method.ReturnType;
            if (ExternalApiProfiles.TryCreate(uniqueId, apiType, context) is { } api)
            {
                context.State?.NoteAssemblyLoad($"External mod API '{uniqueId}' is simulated by the headless probe.");
                return api;
            }

            context.State?.NoteAssemblyLoad($"External mod API '{uniqueId}' is unavailable in the headless probe; null was returned.");
            return null;
        }

        if (method.Name == "Get" && method.ReturnType.IsInterface && context.SmapiAssembly is not null)
        {
            if (!isGmcm && !isCurrentMod && !ExternalApiProfiles.Supports(uniqueId))
            {
                return null;
            }

            var manifest = isCurrentMod
                ? context.Manifest!
                : new ProbeManifestData(
                    isGmcm ? "Generic Mod Config Menu" : uniqueId,
                    uniqueId,
                    "999.0.0",
                    "Headless probe",
                    "Synthetic manifest for an API simulated by the headless probe.");
            var manifestType = method.ReturnType.GetProperty("Manifest")?.PropertyType;
            var manifestValue = manifestType is null
                ? null
                : RuntimeProxy.Create(manifestType, new(
                    "Manifest",
                    context.State,
                    context.SmapiAssembly,
                    manifest,
                    null,
                    null));
            return RuntimeProxy.Create(method.ReturnType, new(
                "ModInfo",
                context.State,
                context.SmapiAssembly,
                null,
                new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
                {
                    ["Manifest"] = manifestValue,
                    ["UniqueID"] = manifest.UniqueId,
                    ["UniqueId"] = manifest.UniqueId,
                    ["Name"] = manifest.Name,
                },
                null));
        }

        if (method.Name == "GetAll" && RuntimeDefaultFactory.IsEnumerableType(method.ReturnType))
        {
            return RuntimeDefaultFactory.CreateEmptyEnumerable(method.ReturnType);
        }

        return RuntimeDefaultFactory.Create(method.ReturnType, context);
    }

    public static object? InvokeMonitor(RuntimeProxyContext context, MethodInfo method, object?[] args)
    {
        if ((method.Name == "Log" || method.Name == "LogOnce") && args.Length > 0)
        {
            var level = args.ElementAtOrDefault(1)?.ToString() ?? "Trace";
            if (IsDiagnosticLevel(level))
            {
                context.State?.NoteAssemblyLoad($"Mod log [{level}]: {args[0]}");
            }
        }
        else if (method.Name == "VerboseLog")
        {
            return null;
        }

        return RuntimeDefaultFactory.Create(method.ReturnType, context);
    }

    public static object? InvokeTranslation(RuntimeProxyContext context, MethodInfo method, object?[] args)
    {
        if (method.Name == "GetTranslations")
        {
            return RuntimeDefaultFactory.CreateEmptyEnumerable(method.ReturnType);
        }

        if (method.Name != "Get" && method.Name != "GetInAllLocales")
        {
            return RuntimeDefaultFactory.Create(method.ReturnType, context);
        }

        var key = args.FirstOrDefault()?.ToString() ?? "";
        var text = RuntimeTranslationStore.LoadTranslationValue(context.State!.ModPath, key);
        if (method.Name == "GetInAllLocales")
        {
            return RuntimeDefaultFactory.CreateSingleItemEnumerable(
                method.ReturnType,
                CreateTranslation(RuntimeDefaultFactory.GetEnumerableItemType(method.ReturnType) ?? method.ReturnType, key, text));
        }
        return CreateTranslation(method.ReturnType, key, text);
    }

    public static object? InvokeData(RuntimeProxyContext context, MethodInfo method, object?[] args)
    {
        if (method.Name == "ReadGlobalData")
        {
            return RuntimeDefaultFactory.Create(method.ReturnType, context);
        }

        if (method.Name == "WriteGlobalData")
        {
            return null;
        }

        if (method.Name != "ReadJsonFile" || args.FirstOrDefault() is not string path)
        {
            return RuntimeDefaultFactory.Create(method.ReturnType, context);
        }

        var fullPath = ResolveRuntimeFile(context.State!, path);
        if (fullPath is null)
        {
            return RuntimeDefaultFactory.Create(method.ReturnType, context);
        }

        var returnType = Nullable.GetUnderlyingType(method.ReturnType) ?? method.ReturnType;
        var json = File.ReadAllText(fullPath);
        return ProbeJson.Deserialize(json, returnType);
    }

    public static object? InvokeContent(RuntimeProxyContext context, MethodInfo method, object?[] args)
    {
        if (method.Name == "Load" && args.FirstOrDefault() is string key)
        {
            var modelType = method.GetGenericArguments().FirstOrDefault() ?? method.ReturnType;
            var fullPath = ResolveContentPath(context.State!, key);
            if (fullPath is not null)
            {
                if (!fullPath.EndsWith(".json", StringComparison.OrdinalIgnoreCase))
                {
                    return RuntimeValueFactory.CreateConfigFallback(modelType) ?? RuntimeDefaultFactory.Create(method.ReturnType, context);
                }

                try
                {
                    var json = File.ReadAllText(fullPath);
                    return ProbeJson.Deserialize(json, modelType) ?? RuntimeValueFactory.CreateConfigFallback(modelType);
                }
                catch (Exception ex)
                {
                    context.State?.NoteAssemblyLoad($"Content asset {key} could not be read in headless probe; using a fallback: {ex.GetBaseException().Message}");
                }
            }

            return RuntimeValueFactory.CreateConfigFallback(modelType) ?? RuntimeDefaultFactory.Create(method.ReturnType, context);
        }

        return RuntimeDefaultFactory.Create(method.ReturnType, context);
    }

    public static object? InvokeContentPacks(RuntimeProxyContext context, MethodInfo method)
    {
        if (method.Name == "GetOwned" && RuntimeDefaultFactory.IsEnumerableType(method.ReturnType))
        {
            return RuntimeDefaultFactory.CreateEmptyEnumerable(method.ReturnType);
        }

        if (method.Name == "GetOwned" && method.ReturnType.IsInterface)
        {
            return RuntimeProxy.Create(method.ReturnType, new(
                "ContentPack",
                context.State,
                context.SmapiAssembly,
                null,
                new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
                {
                    ["DirectoryPath"] = context.State!.ModPath,
                    ["Manifest"] = context.SmapiAssembly?.GetType("StardewModdingAPI.IManifest") is { } manifestType
                        ? RuntimeSmapiProxy.CreateManifest(manifestType, context.State.ModPath)
                        : null,
                },
                null));
        }

        return RuntimeDefaultFactory.Create(method.ReturnType, context);
    }

    public static object? InvokeContentPack(RuntimeProxyContext context, MethodInfo method, object?[] args)
    {
        if (method.Name == "HasFile" && args.FirstOrDefault() is string path)
        {
            return ResolveContentPath(context.State!, path) is not null;
        }

        if (method.Name == "ReadJsonFile" && args.FirstOrDefault() is string jsonPath)
        {
            var modelType = method.GetGenericArguments().FirstOrDefault() ?? method.ReturnType;
            var fullPath = ResolveContentPath(context.State!, jsonPath);
            if (fullPath is null)
            {
                return RuntimeDefaultFactory.Create(method.ReturnType, context);
            }

            return ProbeJson.Deserialize(File.ReadAllText(fullPath), modelType);
        }

        return RuntimeDefaultFactory.Create(method.ReturnType, context);
    }

    public static object? InvokeReflection(RuntimeProxyContext context, MethodInfo method, object?[] args)
    {
        if (method.Name != "GetField" || method.ReturnType.IsGenericType is false)
        {
            return RuntimeDefaultFactory.Create(method.ReturnType, context);
        }

        var returnType = ResolveReflectedFieldReturnType(method, args);
        try
        {
            var proxy = RuntimeReflectedFieldFactory.Create(returnType);
            if (proxy is not null && returnType.IsInstanceOfType(proxy))
            {
                return proxy;
            }

            context.State?.NoteAssemblyLoad($"Reflection.GetField could not create an assignable no-op {returnType.FullName ?? returnType.Name}; returning null.");
            return null;
        }
        catch (Exception ex)
        {
            context.State?.NoteAssemblyLoad($"Reflection.GetField no-op proxy failed for {returnType.FullName ?? returnType.Name}: {ex.GetBaseException().Message}");
            return null;
        }
    }

    public static object? InvokeConsoleCommands(RuntimeProxyContext context, MethodInfo method, object proxy)
    {
        if (method.Name == "Add")
        {
            return method.ReturnType.IsInstanceOfType(proxy)
                ? proxy
                : method.ReturnType.IsInterface
                    ? RuntimeProxy.Create(method.ReturnType, new("ConsoleCommands", context.State, context.SmapiAssembly, null, null, null))
                    : RuntimeDefaultFactory.Create(method.ReturnType, context);
        }

        return RuntimeDefaultFactory.Create(method.ReturnType, context);
    }

    private static Type ResolveReflectedFieldReturnType(MethodInfo method, object?[] args)
    {
        if (method.ReturnType.ContainsGenericParameters
            && method.ReturnType.IsGenericType
            && TryInferReflectedFieldValueType(args) is { } valueType)
        {
            return method.ReturnType.GetGenericTypeDefinition().MakeGenericType(valueType);
        }

        return ResolveGenericReturnType(method);
    }

    private static Type? TryInferReflectedFieldValueType(object?[] args)
    {
        if (args.Length < 2 || args[1] is not string fieldName || string.IsNullOrWhiteSpace(fieldName))
        {
            return null;
        }

        var ownerType = args[0] as Type ?? args[0]?.GetType();
        if (ownerType is null)
        {
            return null;
        }

        for (var current = ownerType; current is not null; current = current.BaseType)
        {
            var field = current.GetField(fieldName, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static);
            if (field is not null)
            {
                return field.FieldType;
            }
        }

        return null;
    }

    private static Type ResolveGenericReturnType(MethodInfo method)
    {
        if (!method.ReturnType.ContainsGenericParameters || !method.IsGenericMethod)
        {
            return method.ReturnType;
        }

        var methodArguments = method.GetGenericArguments();
        var returnArguments = method.ReturnType.GetGenericArguments()
            .Select(argument => argument.IsGenericParameter && argument.GenericParameterPosition < methodArguments.Length
                ? methodArguments[argument.GenericParameterPosition]
                : argument)
            .ToArray();
        return method.ReturnType.GetGenericTypeDefinition().MakeGenericType(returnArguments);
    }

    private static object? CreateTranslation(Type translationType, string key, string text)
    {
        if (translationType == typeof(string))
        {
            return text;
        }

        var threeStringConstructor = translationType.GetConstructor(
            BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic,
            binder: null,
            types: [typeof(string), typeof(string), typeof(string)],
            modifiers: null);
        if (threeStringConstructor is not null)
        {
            return threeStringConstructor.Invoke(["default", key, text]);
        }

        var oneStringConstructor = translationType.GetConstructor(
            BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic,
            binder: null,
            types: [typeof(string)],
            modifiers: null);
        return oneStringConstructor?.Invoke([text])
            ?? RuntimeValueFactory.CreateDefaultInstance(translationType);
    }

    private static bool IsDiagnosticLevel(string level)
    {
        return level.Equals("Warn", StringComparison.OrdinalIgnoreCase)
            || level.Equals("Error", StringComparison.OrdinalIgnoreCase)
            || level.Equals("Alert", StringComparison.OrdinalIgnoreCase);
    }

    private static string? ResolveContentPath(ProbeState state, string key)
    {
        var normalized = key.Replace('\\', Path.DirectorySeparatorChar).Replace('/', Path.DirectorySeparatorChar);
        string[] relativeCandidates =
        [
            normalized,
            $"{normalized}.json",
            Path.Combine("assets", normalized),
            Path.Combine("assets", $"{normalized}.json"),
            Path.Combine("data", normalized),
            Path.Combine("data", $"{normalized}.json"),
        ];

        string? rejection = null;
        foreach (var relativePath in relativeCandidates)
        {
            if (ProbePathSafety.TryResolveRelativeFileWithinRoot(
                state.ModPath,
                relativePath,
                out var resolved,
                out var error))
            {
                return resolved;
            }
            rejection ??= error;
        }
        if (rejection is not null)
        {
            state.NoteAssemblyLoad($"Rejected headless content path '{key}': {rejection}");
        }

        return null;
    }

    private static string? ResolveRuntimeFile(ProbeState state, string relativePath)
    {
        if (ProbePathSafety.TryResolveRelativeFileWithinRoot(
            state.ModPath,
            relativePath,
            out var resolved,
            out var error))
        {
            return resolved;
        }
        if (error is not null)
        {
            state.NoteAssemblyLoad($"Rejected headless data path '{relativePath}': {error}");
        }

        return null;
    }
}
