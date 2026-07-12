internal static class RuntimeSmapiProxy
{
    private static readonly HelperSpec[] OptionalHelperSpecs =
    [
        new("Translation", "StardewModdingAPI.ITranslationHelper", "Translation"),
        new("Data", "StardewModdingAPI.IDataHelper", "Data"),
        new("ModContent", "StardewModdingAPI.IModContentHelper", "ModContent"),
        new("GameContent", "StardewModdingAPI.IGameContentHelper", "GameContent"),
        new("Input", "StardewModdingAPI.IInputHelper", "Input"),
        new("Reflection", "StardewModdingAPI.IReflectionHelper", "Reflection"),
        new("ConsoleCommands", "StardewModdingAPI.ICommandHelper", "ConsoleCommands"),
        new("ContentPacks", "StardewModdingAPI.IContentPackHelper", "ContentPacks"),
        new("Multiplayer", "StardewModdingAPI.IMultiplayerHelper", "Multiplayer"),
    ];

    public static object CreateManifest(Type interfaceType, string modPath)
    {
        var manifest = ProbeManifestData.Load(modPath);
        return RuntimeProxy.Create(interfaceType, new(
            "Manifest",
            null,
            null,
            manifest,
            null,
            null));
    }

    public static RuntimeHelperBundle CreateHelper(
        Assembly smapiAssembly,
        ProbeState state,
        object? manifest,
        ProbeState? eventState = null)
    {
        var manifestData = ProbeManifestData.Load(state.ModPath);
        var eventActivityState = eventState ?? state;
        var gameLoopEvents = CreateEvents(smapiAssembly, eventActivityState, "StardewModdingAPI.Events.IGameLoopEvents", "GameLoopEvents");
        var inputEvents = CreateEvents(smapiAssembly, eventActivityState, "StardewModdingAPI.Events.IInputEvents", "InputEvents");
        var events = CreateEventsRoot(smapiAssembly, eventActivityState, gameLoopEvents, inputEvents);
        var monitor = CreateMonitor(smapiAssembly, state);
        var registry = CreateModRegistry(smapiAssembly, state, manifestData);
        var helperType = RequiredType(smapiAssembly, "StardewModdingAPI.IModHelper");
        Dictionary<string, object?> properties = new(StringComparer.OrdinalIgnoreCase)
        {
            ["DirectoryPath"] = state.ModPath,
            ["ModRegistry"] = registry,
            ["Events"] = events,
            ["Monitor"] = monitor,
        };
        foreach (var spec in OptionalHelperSpecs)
        {
            properties[spec.PropertyName] = CreateOptionalHelper(smapiAssembly, state, spec, manifestData);
        }
        if (manifest is not null)
        {
            properties["Manifest"] = manifest;
            properties["ModManifest"] = manifest;
        }

        var helper = RuntimeProxy.Create(helperType, new(
            "Helper",
            state,
            smapiAssembly,
            null,
            properties,
            null));
        return new RuntimeHelperBundle(helper, monitor);
    }

    public static void RaiseGameLaunched(object helper)
    {
        var events = helper.GetType().GetProperty("Events")?.GetValue(helper);
        var gameLoop = events?.GetType().GetProperty("GameLoop")?.GetValue(events);
        if (gameLoop is IRuntimeEventSource source)
        {
            source.Raise("GameLaunched");
        }
    }

    private static object CreateEventsRoot(Assembly smapiAssembly, ProbeState state, object gameLoopEvents, object inputEvents)
    {
        var eventsType = RequiredType(smapiAssembly, "StardewModdingAPI.Events.IModEvents");
        return RuntimeProxy.Create(eventsType, new(
            "Events",
            state,
            smapiAssembly,
            null,
            new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
            {
                ["GameLoop"] = gameLoopEvents,
                ["Input"] = inputEvents,
            },
            null));
    }

    private static object CreateEvents(Assembly smapiAssembly, ProbeState state, string typeName, string label)
    {
        var eventsType = smapiAssembly.GetType(typeName);
        if (eventsType is null)
        {
            return NullObject.Instance;
        }

        return RuntimeProxy.Create(eventsType, new(
            label,
            state,
            smapiAssembly,
            null,
            null,
            new RuntimeEventStore(eventsType, state)));
    }

    private static object CreateMonitor(Assembly smapiAssembly, ProbeState state)
    {
        var monitorType = RequiredType(smapiAssembly, "StardewModdingAPI.IMonitor");
        return RuntimeProxy.Create(monitorType, new("Monitor", state, smapiAssembly, null, null, null));
    }

    private static object CreateModRegistry(
        Assembly smapiAssembly,
        ProbeState state,
        ProbeManifestData manifest)
    {
        var registryType = RequiredType(smapiAssembly, "StardewModdingAPI.IModRegistry");
        return RuntimeProxy.Create(registryType, new("ModRegistry", state, smapiAssembly, manifest, null, null));
    }

    private static object CreateOptionalHelper(
        Assembly smapiAssembly,
        ProbeState state,
        HelperSpec spec,
        ProbeManifestData manifest)
    {
        var helperType = smapiAssembly.GetType(spec.TypeName);
        if (helperType is null)
        {
            return NullObject.Instance;
        }

        return RuntimeProxy.Create(helperType, new(
            spec.Role,
            state,
            smapiAssembly,
            spec.Role == "ModContent" ? manifest : null,
            null,
            null));
    }

    private static Type RequiredType(Assembly assembly, string name)
    {
        return assembly.GetType(name) ?? throw new InvalidOperationException($"{name} was not found in {assembly.FullName}.");
    }

    private sealed record HelperSpec(string PropertyName, string TypeName, string Role);
}
