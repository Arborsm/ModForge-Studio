internal interface IRuntimeEventSource
{
    void Raise(string eventName);
}

internal sealed class RuntimeEventStore(Type eventsType, ProbeState? state)
{
    private readonly Dictionary<string, List<Delegate>> handlers = new(StringComparer.OrdinalIgnoreCase);

    public void Add(string eventName, Delegate handler)
    {
        if (!handlers.TryGetValue(eventName, out var eventHandlers))
        {
            eventHandlers = [];
            handlers[eventName] = eventHandlers;
        }
        eventHandlers.Add(handler);
    }

    public void Remove(string eventName, Delegate handler)
    {
        if (handlers.TryGetValue(eventName, out var eventHandlers))
        {
            eventHandlers.Remove(handler);
        }
    }

    public void Raise(string eventName)
    {
        if (!handlers.TryGetValue(eventName, out var eventHandlers))
        {
            return;
        }

        var eventInfo = eventsType.GetEvent(eventName);
        var argsType = eventInfo?.EventHandlerType?.GetMethod("Invoke")?.GetParameters().ElementAtOrDefault(1)?.ParameterType;
        var args = CreateEventArgs(argsType);
        foreach (var handler in eventHandlers.ToList())
        {
            var fieldsBefore = state?.GmcmFieldsCaptured ?? 0;
            var interactionsBefore = state?.GmcmInteractionCount ?? 0;
            try
            {
                handler.DynamicInvoke(null, args);
            }
            catch (Exception ex)
            {
                var partialFields = Math.Max(0, (state?.GmcmFieldsCaptured ?? 0) - fieldsBefore);
                var handlerTouchedGmcm = partialFields > 0
                    || (state?.GmcmInteractionCount ?? 0) > interactionsBefore;
                var abortGmcmBatch = eventName.Equals("GameLaunched", StringComparison.OrdinalIgnoreCase)
                    && handlerTouchedGmcm;
                var loaderFailure = RuntimeProxy.IsLoaderCompatibilityFailure(ex);
                var action = abortGmcmBatch || loaderFailure ? "aborted" : "ignored";
                state?.NoteAssemblyLoad(
                    $"{eventsType.Name}.{eventName} handler {action} in headless probe: {ex.GetBaseException().GetType().Name}: {ex.GetBaseException().Message}");
                if ((abortGmcmBatch || loaderFailure) && state is not null)
                {
                    state.FailureStage ??= $"event:{eventName}";
                }
                if (abortGmcmBatch || loaderFailure)
                {
                    throw;
                }
            }
        }
    }

    private static object? CreateEventArgs(Type? argsType)
    {
        if (argsType is null || argsType == typeof(EventArgs))
        {
            return EventArgs.Empty;
        }

        try
        {
            var constructor = argsType.GetConstructors(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)
                .OrderBy(constructor => constructor.GetParameters().Length)
                .FirstOrDefault();
            if (constructor is null)
            {
                return EventArgs.Empty;
            }

            var values = constructor.GetParameters().Select(parameter => DefaultValue(parameter.ParameterType)).ToArray();
            return constructor.Invoke(values);
        }
        catch
        {
            return EventArgs.Empty;
        }
    }

    private static object? DefaultValue(Type type)
    {
        return type.IsValueType ? Activator.CreateInstance(type) : null;
    }
}

internal class RuntimeProxy : DispatchProxy, IRuntimeEventSource
{
    private RuntimeProxyContext? context;

    public static object Create(Type interfaceType, RuntimeProxyContext context)
    {
        if (context.Role == "Monitor"
            || interfaceType.FullName == "StardewModdingAPI.IAssetName")
        {
            return RuntimeEmittedInterfaceProxy.Create(interfaceType);
        }
        var proxy = CreateProxy(interfaceType);
        ((RuntimeProxy)proxy).context = context;
        return proxy;
    }

    private static object CreateProxy(Type interfaceType)
    {
        using var contextualReflection = AssemblyLoadContext.EnterContextualReflection(interfaceType.Assembly);
        var create = typeof(DispatchProxy)
            .GetMethods(BindingFlags.Public | BindingFlags.Static)
            .Single(method => method.Name == nameof(DispatchProxy.Create) && method.GetGenericArguments().Length == 2)
            .MakeGenericMethod(interfaceType, typeof(RuntimeProxy));
        return create.Invoke(null, null) ?? throw new InvalidOperationException($"Failed to create proxy for {interfaceType.FullName}.");
    }

    public void Raise(string eventName)
    {
        context?.Events?.Raise(eventName);
    }

    protected override object? Invoke(MethodInfo? targetMethod, object?[]? args)
    {
        if (targetMethod is null || context is null)
        {
            return null;
        }

        args ??= [];
        try
        {
            if (targetMethod.IsSpecialName)
            {
                if (targetMethod.Name.StartsWith("get_", StringComparison.Ordinal))
                {
                    return GetProperty(targetMethod.Name["get_".Length..], targetMethod.ReturnType);
                }
                if (targetMethod.Name.StartsWith("add_", StringComparison.Ordinal) && args.FirstOrDefault() is Delegate addHandler)
                {
                    context.Events?.Add(targetMethod.Name["add_".Length..], addHandler);
                    return null;
                }
                if (targetMethod.Name.StartsWith("remove_", StringComparison.Ordinal) && args.FirstOrDefault() is Delegate removeHandler)
                {
                    context.Events?.Remove(targetMethod.Name["remove_".Length..], removeHandler);
                    return null;
                }
            }
            return context.Role switch
            {
                "Helper" => RuntimeProxyHandlers.InvokeHelper(context, targetMethod),
                "ModRegistry" => RuntimeProxyHandlers.InvokeModRegistry(context, targetMethod, args),
                "Monitor" => RuntimeProxyHandlers.InvokeMonitor(context, targetMethod, args),
                "Translation" => RuntimeProxyHandlers.InvokeTranslation(context, targetMethod, args),
                "Data" => RuntimeProxyHandlers.InvokeData(context, targetMethod, args),
                "ModContent" or "GameContent" => RuntimeProxyHandlers.InvokeContent(context, targetMethod, args),
                "Reflection" => RuntimeProxyHandlers.InvokeReflection(context, targetMethod, args),
                "ConsoleCommands" => RuntimeProxyHandlers.InvokeConsoleCommands(context, targetMethod, this),
                "ContentPacks" => RuntimeProxyHandlers.InvokeContentPacks(context, targetMethod),
                "ContentPack" => RuntimeProxyHandlers.InvokeContentPack(context, targetMethod, args),
                "ContentPatcherApi" => ExternalApiProfiles.InvokeContentPatcherApi(targetMethod, args, context),
                "Multiplayer" => RuntimeDefaultFactory.Create(targetMethod.ReturnType, context),
                _ => RuntimeDefaultFactory.Create(targetMethod.ReturnType, context)
            };
        }
        catch (Exception ex)
        {
            if (IsLoaderCompatibilityFailure(ex))
            {
                throw;
            }

            context.State?.NoteAssemblyLoad($"{context.Role}.{targetMethod.Name} failed in headless probe; a no-op value was returned: {ex.GetBaseException().Message}");
            return RuntimeDefaultFactory.Create(targetMethod.ReturnType, context);
        }
    }

    private object? GetProperty(string name, Type returnType)
    {
        if (context?.Properties is not null && context.Properties.TryGetValue(name, out var value))
        {
            return value is NullObject ? RuntimeDefaultFactory.Create(returnType, context) : value;
        }

        if (context?.Manifest is not null)
        {
            return name switch
            {
                "Name" => context.Manifest.Name,
                "Author" => context.Manifest.Author,
                "Description" => context.Manifest.Description,
                "UniqueID" or "UniqueId" => context.Manifest.UniqueId,
                "ModID" => context.Manifest.UniqueId,
                "Version" => CreateSemanticVersion(returnType, context.Manifest.Version, context),
                "Manifest" => RuntimeProxy.Create(returnType, new("Manifest", context.State, context.SmapiAssembly, context.Manifest, null, null)),
                "IsContentPack" => false,
                _ => RuntimeDefaultFactory.Create(returnType, context)
            };
        }

        if (context?.Role == "Events" && returnType.IsInterface && context.SmapiAssembly is not null)
        {
            var events = RuntimeProxy.Create(returnType, new(
                $"{name}Events",
                context.State,
                context.SmapiAssembly,
                null,
                null,
                new RuntimeEventStore(returnType, context.State)));
            if (context.Properties is IDictionary<string, object?> mutableProperties)
            {
                mutableProperties[name] = events;
            }
            return events;
        }

        if (context?.Role == "Helper" && returnType.IsInterface)
        {
            return RuntimeProxy.Create(returnType, new(name, context.State, context.SmapiAssembly, null, null, null));
        }

        return RuntimeDefaultFactory.Create(returnType, context);
    }

    private static object? CreateSemanticVersion(
        Type semanticVersionType,
        string version,
        RuntimeProxyContext context)
    {
        if (semanticVersionType == typeof(string))
        {
            return version;
        }

        var constructor = semanticVersionType.GetConstructor([typeof(string)]);
        return constructor is null
            ? RuntimeDefaultFactory.Create(semanticVersionType, context, "SemanticVersion")
            : constructor.Invoke([version]);
    }

    internal static bool IsLoaderCompatibilityFailure(Exception exception)
    {
        for (var current = exception; current is not null; current = current.InnerException)
        {
            if (current is ReflectionTypeLoadException reflectionFailure
                && reflectionFailure.LoaderExceptions.Any(error =>
                    error is not null && IsLoaderCompatibilityFailure(error)))
            {
                return true;
            }

            if (current is AggregateException aggregate
                && aggregate.InnerExceptions.Any(IsLoaderCompatibilityFailure))
            {
                return true;
            }

            var detail = current.ToString();
            if (current is FileNotFoundException notFound
                && LooksLikeAssemblyReference(notFound.FileName)
                && HasSmapiCompatibilityContext($"{notFound.FileName}\n{detail}"))
            {
                return true;
            }
            if (current is FileLoadException loadFailure
                && LooksLikeAssemblyReference(loadFailure.FileName)
                && HasSmapiCompatibilityContext($"{loadFailure.FileName}\n{detail}"))
            {
                return true;
            }
            var isAbiFailure = current is BadImageFormatException
                or TypeLoadException
                or MissingMethodException
                or MissingFieldException
                or EntryPointNotFoundException;
            if (isAbiFailure && HasSmapiCompatibilityContext(detail))
            {
                return true;
            }
        }

        return false;
    }

    private static bool LooksLikeAssemblyReference(string? fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName))
        {
            return false;
        }

        return fileName.EndsWith(".dll", StringComparison.OrdinalIgnoreCase)
            || fileName.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)
            || fileName.Contains(", Version=", StringComparison.OrdinalIgnoreCase);
    }

    private static bool HasSmapiCompatibilityContext(string detail)
    {
        string[] markers =
        [
            "StardewModdingAPI",
            "SMAPI.Toolkit",
            "IModLinked",
            "DispatchProxy",
            "generatedProxy",
            "ProxyBuilder",
        ];
        return markers.Any(marker => detail.Contains(marker, StringComparison.OrdinalIgnoreCase));
    }

}

internal static class RuntimeEmittedInterfaceProxy
{
    private static readonly Dictionary<Type, Type> ProxyTypes = [];
    private static readonly object Sync = new();

    public static object Create(Type interfaceType)
    {
        lock (Sync)
        {
            if (!ProxyTypes.TryGetValue(interfaceType, out var proxyType))
            {
                proxyType = BuildProxyType(interfaceType);
                ProxyTypes[interfaceType] = proxyType;
            }
            return Activator.CreateInstance(proxyType)
                ?? throw new InvalidOperationException($"Failed to create emitted proxy for {interfaceType.FullName}.");
        }
    }

    private static Type BuildProxyType(Type interfaceType)
    {
        var assemblyName = new AssemblyName($"ModForge.GmcmProxy.{Guid.NewGuid():N}");
        var assembly = AssemblyBuilder.DefineDynamicAssembly(assemblyName, AssemblyBuilderAccess.Run);
        var accessAttribute = typeof(System.Runtime.CompilerServices.IgnoresAccessChecksToAttribute)
            .GetConstructor([typeof(string)])!;
        assembly.SetCustomAttribute(new(
            accessAttribute,
            [interfaceType.Assembly.GetName().Name ?? interfaceType.Assembly.FullName!]));
        var module = assembly.DefineDynamicModule(assemblyName.Name!);
        var type = module.DefineType(
            $"ModForge.GmcmProxy.{SanitizeTypeName(interfaceType.FullName ?? interfaceType.Name)}_{Guid.NewGuid():N}",
            TypeAttributes.Public | TypeAttributes.Sealed | TypeAttributes.Class);
        type.AddInterfaceImplementation(interfaceType);
        type.DefineDefaultConstructor(MethodAttributes.Public);

        var methods = interfaceType
            .GetInterfaces()
            .Append(interfaceType)
            .SelectMany(candidate => candidate.GetMethods(
                BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance))
            .Distinct()
            .ToList();
        foreach (var method in methods)
        {
            var parameters = method.GetParameters();
            var implementation = type.DefineMethod(
                $"{method.DeclaringType?.FullName}.{method.Name}",
                MethodAttributes.Private
                    | MethodAttributes.Final
                    | MethodAttributes.Virtual
                    | MethodAttributes.HideBySig
                    | MethodAttributes.NewSlot,
                CallingConventions.HasThis,
                method.ReturnType,
                parameters.Select(parameter => parameter.ParameterType).ToArray());
            for (var index = 0; index < parameters.Length; index++)
            {
                implementation.DefineParameter(index + 1, parameters[index].Attributes, parameters[index].Name);
            }
            EmitDefaultReturn(implementation.GetILGenerator(), method.ReturnType, interfaceType);
            type.DefineMethodOverride(implementation, method);
        }

        return type.CreateType()
            ?? throw new InvalidOperationException($"Failed to build emitted proxy type for {interfaceType.FullName}.");
    }

    private static void EmitDefaultReturn(ILGenerator il, Type returnType, Type interfaceType)
    {
        if (returnType == typeof(void))
        {
            il.Emit(OpCodes.Ret);
            return;
        }
        if (returnType == typeof(string))
        {
            il.Emit(OpCodes.Ldstr, "");
            il.Emit(OpCodes.Ret);
            return;
        }
        if (returnType.IsAssignableFrom(interfaceType))
        {
            il.Emit(OpCodes.Ldarg_0);
            il.Emit(OpCodes.Ret);
            return;
        }
        if (returnType.IsValueType)
        {
            var value = il.DeclareLocal(returnType);
            il.Emit(OpCodes.Ldloca_S, value);
            il.Emit(OpCodes.Initobj, returnType);
            il.Emit(OpCodes.Ldloc, value);
            il.Emit(OpCodes.Ret);
            return;
        }
        il.Emit(OpCodes.Ldnull);
        il.Emit(OpCodes.Ret);
    }

    private static string SanitizeTypeName(string value)
    {
        return string.Concat(value.Select(character => char.IsLetterOrDigit(character) ? character : '_'));
    }
}

namespace System.Runtime.CompilerServices
{
    [AttributeUsage(AttributeTargets.Assembly, AllowMultiple = true)]
    internal sealed class IgnoresAccessChecksToAttribute(string assemblyName) : Attribute
    {
        public string AssemblyName { get; } = assemblyName;
    }
}
