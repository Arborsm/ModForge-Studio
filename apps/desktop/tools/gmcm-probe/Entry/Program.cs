using System.Diagnostics;
using System.Reflection;
using System.Reflection.Emit;
using System.Runtime.Loader;
using System.Runtime.Serialization;
using System.Security;
using System.Text.Json;
using System.Text.Json.Serialization;

var options = new JsonSerializerOptions
{
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    WriteIndented = false,
};
var selfTestRequested = args.Any(argument => argument.Equals("--self-test", StringComparison.OrdinalIgnoreCase));

try
{
    if (selfTestRequested)
    {
        ProbeSelfTests.Run();
        Console.WriteLine(JsonSerializer.Serialize(new { selfTest = "passed" }, options));
        return;
    }

    var request = ProbeRequest.Parse(args);
    if (request.Mode != ProbeMode.Inspect)
    {
        GameAssemblyResolver.Install(request);
    }
    using var timeout = new CancellationTokenSource(request.TimeoutMs);
    var result = ProbeRunner.Run(request, timeout.Token);
    Console.WriteLine(JsonSerializer.Serialize(result, options));
    Environment.Exit(result.ProbeStatus == "failed" ? 2 : 0);
}
catch (OperationCanceledException)
{
    Console.WriteLine(JsonSerializer.Serialize(ProbeResult.TimedOut(), options));
    Environment.Exit(3);
}
catch (Exception ex)
{
    Console.WriteLine(JsonSerializer.Serialize(
        ProbeResult.Failed(selfTestRequested ? ex.ToString() : ex.Message),
        options));
    Environment.Exit(2);
}

internal static class ProbeSelfTests
{
    public static void Run()
    {
        CandidateReachabilityAndStaticStorageNames();
        CrossAssemblyRegistrationFallback();
        HarmonyShimAbi();
        EmittedProxyAbi();
        SimulatedRegistryManifest();
        BootstrapDependencySelection();
        DependencyEventActivityState();
        StaticCandidateStateInjection();
        FrameworkOnlyGmcmDetectionDoesNotFail();
        LoaderCompatibilityClassification();
        CanonicalPathContainment();
        GameLaunchedHandlerTransactions();
        ConfigFallbackOverlay();
        StorageKeyReliability();
    }

    private static void EmittedProxyAbi()
    {
        var proxy = (IProbeRefStructMonitor)RuntimeEmittedInterfaceProxy.Create(typeof(IProbeRefStructMonitor));
        Assert(!proxy.IsVerbose, "emitted monitor proxy did not return a default boolean");
        var handler = new ProbeSelfTestVerboseHandler();
        proxy.VerboseLog(ref handler);
        Assert(proxy.GetBaseAssetName() == proxy, "emitted interface proxy did not return itself for its interface type");
    }

    private static void HarmonyShimAbi()
    {
        var accessTools = typeof(HarmonyLib.AccessTools);
        var fieldRef = accessTools.GetNestedType("FieldRef`2", BindingFlags.Public);
        Assert(fieldRef is not null, "Harmony FieldRef<T,F> was not nested under AccessTools");
        var invoke = fieldRef!.GetMethod("Invoke")!;
        Assert(!invoke.GetParameters()[0].ParameterType.IsByRef, "Harmony FieldRef<T,F> instance parameter used ref T instead of T");
        var fieldRefAccess = accessTools
            .GetMethods(BindingFlags.Public | BindingFlags.Static)
            .Single(method => method.Name == "FieldRefAccess"
                && method.IsGenericMethodDefinition
                && method.GetGenericArguments().Length == 2
                && method.GetParameters() is [{ ParameterType: var parameterType }]
                && parameterType == typeof(string));
        Assert(
            fieldRefAccess.ReturnType.IsNested
                && fieldRefAccess.ReturnType.DeclaringType == accessTools,
            "Harmony FieldRefAccess<T,F>(string) returned an ABI-incompatible delegate");
        var patches = typeof(HarmonyLib.Patches);
        Assert(
            patches.GetConstructor([typeof(HarmonyLib.Patch[]), typeof(HarmonyLib.Patch[]), typeof(HarmonyLib.Patch[]), typeof(HarmonyLib.Patch[])]) is not null,
            "Harmony Patches constructor was missing");
        var patch = typeof(HarmonyLib.Patch);
        Assert(
            patch.GetField("owner", BindingFlags.Public | BindingFlags.Instance)?.IsInitOnly == true,
            "Harmony Patch.owner was not a public readonly field");
        Assert(
            patch.GetConstructor([
                typeof(MethodInfo),
                typeof(int),
                typeof(string),
                typeof(int),
                typeof(string[]),
                typeof(string[]),
                typeof(bool),
            ]) is not null,
            "Harmony Patch 2.3 constructor was missing");
        Assert(
            typeof(HarmonyLib.PatchProcessor).GetMethod(
                "GetAllPatchedMethods",
                BindingFlags.Public | BindingFlags.Static,
                null,
                Type.EmptyTypes,
                null)?.ReturnType == typeof(IEnumerable<MethodBase>),
            "Harmony PatchProcessor.GetAllPatchedMethods ABI was missing");
        var allTypes = accessTools.GetMethod(
            "AllTypes",
            BindingFlags.Public | BindingFlags.Static,
            null,
            Type.EmptyTypes,
            null);
        Assert(
            allTypes?.ReturnType == typeof(IEnumerable<Type>),
            "Harmony AccessTools.AllTypes ABI was missing");
        Assert(
            HarmonyLib.AccessTools.AllTypes().Contains(typeof(ProbeSelfTests)),
            "Harmony AccessTools.AllTypes did not enumerate loaded probe types");
    }

    private static void SimulatedRegistryManifest()
    {
        var root = CreateTempDirectory("registry");
        try
        {
            File.WriteAllText(
                Path.Combine(root, "manifest.json"),
                """{"Name":"Registry fixture","UniqueID":"Probe.Registry","Version":"1.2.3"}""");
            var state = new ProbeState(root);
            var manifest = RuntimeSmapiProxy.CreateManifest(typeof(StardewModdingAPI.IManifest), root);
            var helperBundle = RuntimeSmapiProxy.CreateHelper(
                typeof(StardewModdingAPI.IModHelper).Assembly,
                state,
                manifest);
            var helper = (StardewModdingAPI.IModHelper)helperBundle.Helper;
            var info = helper.ModRegistry.Get("spacechase0.GenericModConfigMenu");

            Assert(info?.Manifest is not null, "simulated GMCM registry entry did not expose a manifest");
            Assert(
                !info!.Manifest.Version.IsOlderThan("1.9.6"),
                "simulated GMCM manifest was rejected by a minimum-version check");
            Assert(
                ((StardewModdingAPI.IModLinked)helper.ModContent).ModID == "Probe.Registry",
                "mod content helper did not expose the current mod ID");
            Assert(
                helper.ModRegistry.Get("Probe.Registry")?.Manifest.UniqueID == "Probe.Registry",
                "simulated registry did not return the current mod manifest");
            Assert(
                helper.ModRegistry.Get("missing.Mod") is null,
                "unknown external mod was reported as installed by the simulated registry");
        }
        finally
        {
            DeleteDirectory(root);
        }
    }

    private static void StaticCandidateStateInjection()
    {
        var root = CreateTempDirectory("static-state");
        try
        {
            File.WriteAllText(
                Path.Combine(root, "manifest.json"),
                """{"Name":"Static fixture","UniqueID":"Probe.Static","Version":"1.0.0"}""");
            var state = new ProbeState(root);
            var manifest = RuntimeSmapiProxy.CreateManifest(typeof(StardewModdingAPI.IManifest), root);
            var helperBundle = RuntimeSmapiProxy.CreateHelper(
                typeof(StardewModdingAPI.IModHelper).Assembly,
                state,
                manifest);
            var mod = new ProbeSelfTestMod();

            ProbeStaticCandidateState.Helper = null;
            ProbeStaticCandidateState.ModConfig = null;
            HeadlessEntryRunner.InitializeCandidateStaticMembers(
                Assembly.GetExecutingAssembly(),
                mod,
                helperBundle,
                state);

            Assert(
                ReferenceEquals(ProbeStaticCandidateState.Helper, helperBundle.Helper),
                "candidate static Helper field was not injected");
            Assert(
                ProbeStaticCandidateState.ModConfig is not null,
                "candidate static config field was not initialized");
        }
        finally
        {
            ProbeStaticCandidateState.Helper = null;
            ProbeStaticCandidateState.ModConfig = null;
            DeleteDirectory(root);
        }
    }

    private static void BootstrapDependencySelection()
    {
        var root = CreateTempDirectory("bootstrap-dependencies");
        var targetPath = Path.Combine(root, "Target");
        var targetEntryPath = Path.Combine(targetPath, "bin");
        var requiredPath = Path.Combine(root, "Required");
        var optionalPath = Path.Combine(root, "Optional");
        try
        {
            Directory.CreateDirectory(targetEntryPath);
            Directory.CreateDirectory(requiredPath);
            Directory.CreateDirectory(optionalPath);
            File.WriteAllText(
                Path.Combine(targetPath, "manifest.json"),
                """{"Name":"Target","UniqueID":"Probe.Target","Version":"1.0.0","Dependencies":[{"UniqueID":"Probe.Required"},{"UniqueID":"Probe.Optional","IsRequired":false}]}""");
            File.WriteAllText(
                Path.Combine(requiredPath, "manifest.json"),
                """{"Name":"Required","UniqueID":"Probe.Required","Version":"1.0.0","EntryDll":"StardewModdingAPI.dll"}""");
            File.WriteAllText(
                Path.Combine(optionalPath, "manifest.json"),
                """{"Name":"Optional","UniqueID":"Probe.Optional","Version":"1.0.0","EntryDll":"0Harmony.dll"}""");
            File.Copy(
                typeof(StardewModdingAPI.Mod).Assembly.Location,
                Path.Combine(requiredPath, "StardewModdingAPI.dll"));
            File.Copy(
                typeof(HarmonyLib.Harmony).Assembly.Location,
                Path.Combine(optionalPath, "0Harmony.dll"));

            var state = new ProbeState(targetPath);
            var loadContext = new ProbeAssemblyLoadContext(targetEntryPath, null, state);
            var dependencies = loadContext.GetBootstrapDependencies(Assembly.GetExecutingAssembly());

            Assert(
                dependencies is [{ UniqueId: "Probe.Required" }],
                "dependency bootstrap did not require both a direct assembly reference and a required manifest dependency");
        }
        finally
        {
            DeleteDirectory(root);
        }
    }

    private static void DependencyEventActivityState()
    {
        var dependencyState = new ProbeState(Path.GetTempPath());
        var targetState = new ProbeState(Path.GetTempPath()) { GmcmDetected = true };
        var helperBundle = RuntimeSmapiProxy.CreateHelper(
            typeof(StardewModdingAPI.IModHelper).Assembly,
            dependencyState,
            null,
            targetState);
        var helper = (StardewModdingAPI.IModHelper)helperBundle.Helper;
        helper.Events.GameLoop.GameLaunched += (_, _) =>
        {
            targetState.NoteGmcmInteraction();
            targetState.AddField(new ProbeField(
                "DependencyField",
                "Dependency field",
                null,
                null,
                "boolean",
                true,
                [false, true],
                false,
                false,
                "generic-mod-config-menu"));
            throw new InvalidOperationException("dependency callback failed after target GMCM interaction");
        };

        var checkpoint = GmcmCapture.BeginAttempt(targetState);
        var failed = false;
        try
        {
            RuntimeSmapiProxy.RaiseGameLaunched(helperBundle.Helper);
        }
        catch (TargetInvocationException ex)
            when (ex.GetBaseException() is InvalidOperationException)
        {
            failed = true;
            GmcmCapture.RollBack(targetState, checkpoint);
        }

        Assert(failed, "dependency event store did not observe target GMCM activity");
        Assert(targetState.GmcmFieldsCaptured == 0, "failed dependency callback retained partial target fields");
        Assert(dependencyState.GmcmFieldsCaptured == 0, "dependency helper mixed its schema into the target capture");
    }

    private static void FrameworkOnlyGmcmDetectionDoesNotFail()
    {
        var frameworkState = new ProbeState(Path.GetTempPath())
        {
            GmcmDetected = true,
            RuntimeAttempted = true,
        };
        var frameworkResult = ProbeStatusBuilder.Build(frameworkState);
        Assert(
            frameworkResult.ProbeStatus == "not-run",
            "framework-only GMCM reference was classified as a failed mod schema capture");

        var configState = new ProbeState(Path.GetTempPath())
        {
            GmcmDetected = true,
            RuntimeAttempted = true,
            StaticFieldsCaptured = 1,
        };
        var configResult = ProbeStatusBuilder.Build(configState);
        Assert(
            configResult.ProbeStatus == "unavailable",
            "mod-owned static config evidence did not retain GMCM capture failure status");
    }

    private static void CandidateReachabilityAndStaticStorageNames()
    {
        var root = CreateTempDirectory("metadata");
        try
        {
            var assembly = Assembly.GetExecutingAssembly().Location;
            var copy = Path.Combine(root, Path.GetFileName(assembly));
            File.Copy(assembly, copy);
            var state = new ProbeState(root);

            MetadataInspector.Inspect(copy, state, collectFields: true);

            Assert(
                state.RegistrationCandidates.Any(candidate => candidate.MethodName == "ReachableSetupMenu"),
                "reachable GMCM setup method was not retained");
            Assert(
                state.RegistrationCandidates.Any(candidate => candidate.MethodName == "OnGameLaunched"),
                "reachable GameLaunched handler with direct GMCM registration was not retained");
            Assert(
                state.RegistrationCandidates.All(candidate => candidate.MethodName != "DeadLegacyMenu"),
                "unreachable legacy GMCM method was executable");
            var field = state.Fields.FirstOrDefault(field => field.Key == "serialized_enabled");
            Assert(field is not null, "metadata static field did not use its serialized name");
            Assert(field!.StorageKeyReliable, "metadata static field storage key was not reliable");
            Assert(
                state.Fields.All(field => field.Key is not "IgnoredSystemText" and not "IgnoredNewtonsoft"),
                "metadata static fallback exposed a JsonIgnore member");
        }
        finally
        {
            DeleteDirectory(root);
        }
    }

    private static void CrossAssemblyRegistrationFallback()
    {
        var root = CreateTempDirectory("cross-assembly");
        var sourceRoot = Path.Combine(root, "source");
        var modRoot = Path.Combine(root, "mod");
        Directory.CreateDirectory(sourceRoot);
        Directory.CreateDirectory(modRoot);
        try
        {
            var fixtureOutput = BuildCrossAssemblyFixture(sourceRoot);
            foreach (var fileName in new[] { "ProbeCrossAssemblyEntry.dll", "ProbeCrossAssemblyHelper.dll" })
            {
                File.Copy(Path.Combine(fixtureOutput, fileName), Path.Combine(modRoot, fileName));
            }

            var entryDll = Path.Combine(modRoot, "ProbeCrossAssemblyEntry.dll");
            var state = new ProbeState(modRoot);
            MetadataInspector.Inspect(entryDll, state, collectFields: false);

            Assert(
                state.RegistrationCandidates.Any(candidate =>
                    candidate.SourceAssembly == "ProbeCrossAssemblyHelper.dll"
                    && candidate.MethodName == ".ctor"
                    && candidate.EntryType == "CrossAssemblyFixture.CrossAssemblyMod"),
                "reachable constructor registration delegated to a bundled helper assembly was not retained");
            Assert(
                state.RegistrationCandidates.All(candidate => candidate.MethodName != "DeadLegacyMenu"),
                "unreachable helper assembly registration method was executable");

            HeadlessEntryRunner.Run(
                entryDll,
                new ProbeRequest(modRoot, null, 3000, ProbeMode.Runtime),
                state,
                CancellationToken.None);

            Assert(
                state.Fields.Any(field => field.Key == "cross_enabled"),
                "cross-assembly metadata registration fallback did not capture its GMCM field");
            Assert(
                state.CaptureStrategy == "metadata-registration",
                "cross-assembly registration did not use the metadata fallback strategy");
        }
        finally
        {
            DeleteDirectory(root);
        }
    }

    private static void LoaderCompatibilityClassification()
    {
        Assert(
            !RuntimeProxy.IsLoaderCompatibilityFailure(
                new FileNotFoundException("Optional data file is missing.", "assets/optional.json")),
            "ordinary data FileNotFoundException was classified as a SMAPI loader retry");
        Assert(
            RuntimeProxy.IsLoaderCompatibilityFailure(
                new FileNotFoundException(
                    "Could not load file or assembly StardewModdingAPI.",
                    "StardewModdingAPI, Version=4.0.0.0, Culture=neutral, PublicKeyToken=null")),
            "SMAPI assembly FileNotFoundException was not classified as retryable");
    }

    private static void CanonicalPathContainment()
    {
        var parent = CreateTempDirectory("paths");
        var root = Path.Combine(parent, "Foo");
        var sibling = Path.Combine(parent, "Foobar");
        Directory.CreateDirectory(root);
        Directory.CreateDirectory(sibling);
        File.WriteAllText(Path.Combine(root, "inside.json"), "{}");
        File.WriteAllText(Path.Combine(sibling, "outside.json"), "{}");
        try
        {
            Assert(
                ProbePathSafety.TryResolveRelativeFileWithinRoot(
                    root,
                    "inside.json",
                    out var inside,
                    out _)
                && ProbePathSafety.IsWithin(ProbePathSafety.ResolveExistingRealPath(root), inside),
                "in-root file was rejected");
            Assert(
                !ProbePathSafety.TryResolveRelativeFileWithinRoot(
                    root,
                    Path.Combine("..", "Foobar", "outside.json"),
                    out _,
                    out _),
                "parent traversal reached a sibling prefix path");
            Assert(
                !ProbePathSafety.TryResolveRelativeFileWithinRoot(
                    root,
                    Path.GetFullPath(Path.Combine(sibling, "outside.json")),
                    out _,
                    out _),
                "rooted path escaped the mod root");

            var link = Path.Combine(root, "outside-link.json");
            try
            {
                File.CreateSymbolicLink(link, Path.Combine(sibling, "outside.json"));
                Assert(
                    !ProbePathSafety.TryResolveRelativeFileWithinRoot(
                        root,
                        "outside-link.json",
                        out _,
                        out _),
                    "symbolic link escaped the mod root");
            }
            catch (Exception ex) when (ex is UnauthorizedAccessException or IOException or PlatformNotSupportedException)
            {
                // Windows hosts without symlink privileges still execute traversal and rooted-path checks.
            }
        }
        finally
        {
            DeleteDirectory(parent);
        }
    }

    private static void GameLaunchedHandlerTransactions()
    {
        var state = new ProbeState(Path.GetTempPath())
        {
            GmcmDetected = true,
        };
        var events = new RuntimeEventStore(typeof(IProbeSelfTestEvents), state);
        events.Add("GameLaunched", new EventHandler((_, _) =>
        {
            state.NoteGmcmInteraction();
            state.AddField(new ProbeField(
                "First",
                "First",
                null,
                null,
                "boolean",
                true,
                [false, true],
                false,
                false,
                "generic-mod-config-menu"));
        }));
        events.Add("GameLaunched", new EventHandler((_, _) =>
            throw new InvalidOperationException("later handler failed before its first GMCM field")));

        events.Raise("GameLaunched");
        Assert(
            state.GmcmFieldsCaptured == 1,
            "unrelated later GameLaunched failure discarded a completed GMCM handler");

        var partialState = new ProbeState(Path.GetTempPath()) { GmcmDetected = true };
        var partialEvents = new RuntimeEventStore(typeof(IProbeSelfTestEvents), partialState);
        partialEvents.Add("GameLaunched", new EventHandler((_, _) =>
        {
            partialState.NoteGmcmInteraction();
            partialState.AddField(new ProbeField(
                "Partial",
                "Partial",
                null,
                null,
                "boolean",
                true,
                [false, true],
                false,
                false,
                "generic-mod-config-menu"));
            throw new InvalidOperationException("registration handler failed after its first field");
        }));

        var checkpoint = GmcmCapture.BeginAttempt(partialState);
        var failed = false;
        try
        {
            partialEvents.Raise("GameLaunched");
        }
        catch (TargetInvocationException ex)
            when (ex.GetBaseException() is InvalidOperationException)
        {
            failed = true;
            GmcmCapture.RollBack(partialState, checkpoint);
        }

        Assert(failed, "partial GMCM handler did not abort its GameLaunched attempt");
        Assert(partialState.GmcmFieldsCaptured == 0, "failed GMCM handler retained partial fields");
    }

    private static void ConfigFallbackOverlay()
    {
        var root = CreateTempDirectory("overlay");
        var path = Path.Combine(root, "config.json");
        try
        {
            File.WriteAllText(
                path,
                "{\"ShowAdvanced\":false,\"SHOW_ADVANCED\":true,\"PublicValue\":\"legacy\",\"PUBLIC_VALUE\":\"restored\",\"IgnoredSystemText\":true,\"IgnoredNewtonsoft\":true}");
            var config = new ProbeSelfTestConfig();

            RuntimeValueFactory.OverlaySimpleJsonValues(config, path);

            Assert(config.ShowAdvanced, "serialized property alias did not take priority over its CLR name");
            Assert(config.PublicValue == "restored", "serialized field alias did not take priority over its CLR name");
            Assert(
                !config.IgnoredSystemText && !config.IgnoredNewtonsoft,
                "JSON overlay restored a JsonIgnore member");
        }
        finally
        {
            DeleteDirectory(root);
        }
    }

    private static void StorageKeyReliability()
    {
        var state = new ProbeState(Path.GetTempPath());
        var checkpoint = GmcmCapture.BeginAttempt(state);
        var config = new ProbeSelfTestConfig { SerializedEnabled = true };
        var register = typeof(IProbeGenericModConfigMenuApi).GetMethod("Register")!;
        var method = typeof(IProbeGenericModConfigMenuApi).GetMethod("AddBoolOption")!;

        GmcmCapture.Invoke(
            register,
            [
                null,
                (Action)(() => config.SerializedEnabled = false),
                (Action)(() => { }),
            ],
            state);
        GmcmCapture.Invoke(
            method,
            [
                null,
                (Func<bool>)(() => config.SerializedEnabled),
                (Action<bool>)(value => config.SerializedEnabled = value),
                (Func<string>)(() => "Reliable"),
                (Func<string>)(() => "Reliable tooltip"),
                "ui-reliable",
            ],
            state);
        GmcmCapture.Invoke(
            method,
            [
                null,
                (Func<bool>)(() => config.SerializedEnabled || config.Other),
                (Action<bool>)(value => config.Other = value),
                (Func<string>)(() => "Fallback"),
                (Func<string>)(() => "Fallback tooltip"),
                "fallback-id",
            ],
            state);
        GmcmCapture.Invoke(
            method,
            [
                null,
                (Func<bool>)(() => config.SerializedEnabled),
                (Action<bool>)(value => config.SerializedEnabled = value),
                (Func<string>)(() => "Collision"),
                (Func<string>)(() => "Collision tooltip"),
                "collision-ui",
            ],
            state);
        GmcmCapture.Invoke(
            method,
            [
                null,
                (Func<bool>)(() => config.IgnoredSystemText),
                (Action<bool>)(value => config.IgnoredSystemText = value),
                (Func<string>)(() => "Ignored STJ"),
                (Func<string>)(() => "Ignored STJ tooltip"),
                "ignored-stj",
            ],
            state);
        GmcmCapture.Invoke(
            method,
            [
                null,
                (Func<bool>)(() => config.IgnoredNewtonsoft),
                (Action<bool>)(value => config.IgnoredNewtonsoft = value),
                (Func<string>)(() => "Ignored Newtonsoft"),
                (Func<string>)(() => "Ignored Newtonsoft tooltip"),
                "ignored-newtonsoft",
            ],
            state);
        GmcmCapture.Commit(state);

        var reliable = state.Fields.Single(field => field.Key == "serialized_enabled");
        var fallback = state.Fields.Single(field => field.Key == "fallback-id");
        var collision = state.Fields.Single(field => field.Key == "serialized_enabled2");
        var ignoredSystemText = state.Fields.Single(field => field.Key == "ignored-stj");
        var ignoredNewtonsoft = state.Fields.Single(field => field.Key == "ignored-newtonsoft");
        Assert(reliable.StorageKeyReliable, "inferred serialized member key was marked unreliable");
        Assert(Equals(reliable.DefaultValue, false), "reliable storage key did not capture its reset default");
        Assert(!fallback.StorageKeyReliable, "fieldId fallback was marked as a reliable storage key");
        Assert(!collision.StorageKeyReliable, "collision-renamed storage key was marked reliable");
        Assert(!collision.CanMatchExistingConfigKey, "collision-renamed key could be re-enabled by an unrelated config key");
        Assert(collision.DefaultValue is null, "collision-renamed storage key exposed a fabricated default");
        Assert(
            !ignoredSystemText.StorageKeyReliable && !ignoredNewtonsoft.StorageKeyReliable,
            "JsonIgnore-backed runtime members were marked as reliable storage keys");
        GmcmCapture.RollBack(state, checkpoint);
    }

    private static string BuildCrossAssemblyFixture(string sourceRoot)
    {
        var helperRoot = Path.Combine(sourceRoot, "helper");
        var entryRoot = Path.Combine(sourceRoot, "entry");
        var outputRoot = Path.Combine(sourceRoot, "output");
        Directory.CreateDirectory(helperRoot);
        Directory.CreateDirectory(entryRoot);
        Directory.CreateDirectory(outputRoot);

        var helperProject = Path.Combine(helperRoot, "ProbeCrossAssemblyHelper.csproj");
        File.WriteAllText(
            helperProject,
            """
            <Project Sdk="Microsoft.NET.Sdk">
              <PropertyGroup>
                <TargetFramework>net6.0</TargetFramework>
                <LangVersion>latest</LangVersion>
                <ImplicitUsings>enable</ImplicitUsings>
                <Nullable>enable</Nullable>
                <AssemblyName>ProbeCrossAssemblyHelper</AssemblyName>
                <RestoreIgnoreFailedSources>true</RestoreIgnoreFailedSources>
              </PropertyGroup>
            </Project>
            """);
        File.WriteAllText(
            Path.Combine(helperRoot, "RegistrationHelper.cs"),
            """
            using System.Text.Json.Serialization;

            namespace CrossAssemblyFixture;

            public interface IGenericModConfigMenuApi
            {
                void Register(object mod, Action reset, Action save);

                void AddBoolOption(
                    object mod,
                    Func<bool> getValue,
                    Action<bool> setValue,
                    Func<string> name,
                    Func<string> tooltip,
                    string fieldId);
            }

            public sealed class HelperConfig
            {
                [JsonPropertyName("cross_enabled")]
                public bool Enabled { get; set; } = true;
            }

            public sealed class RegistrationBootstrap
            {
                private static HelperConfig Config = new();

                public RegistrationBootstrap(IGenericModConfigMenuApi api)
                {
                    api.Register(new object(), () => Config = new HelperConfig(), () => { });
                    api.AddBoolOption(
                        new object(),
                        () => Config.Enabled,
                        value => Config.Enabled = value,
                        () => "Cross assembly",
                        () => "Cross assembly tooltip",
                        "cross-ui");
                }

                public static void DeadLegacyMenu(IGenericModConfigMenuApi api)
                {
                    api.AddBoolOption(
                        new object(),
                        () => Config.Enabled,
                        value => Config.Enabled = value,
                        () => "Dead legacy",
                        () => "Dead legacy tooltip",
                        "dead-ui");
                }
            }
            """);

        var smapiAssembly = Path.Combine(AppContext.BaseDirectory, "StardewModdingAPI.dll");
        Assert(File.Exists(smapiAssembly), "bundled SMAPI shim was not available for the cross-assembly fixture");
        var escapedHelperProject = SecurityElement.Escape(helperProject)
            ?? throw new InvalidOperationException("Helper fixture project path could not be XML-escaped.");
        var escapedSmapiAssembly = SecurityElement.Escape(smapiAssembly)
            ?? throw new InvalidOperationException("SMAPI shim path could not be XML-escaped.");
        var entryProject = Path.Combine(entryRoot, "ProbeCrossAssemblyEntry.csproj");
        File.WriteAllText(
            entryProject,
            $"""
            <Project Sdk="Microsoft.NET.Sdk">
              <PropertyGroup>
                <TargetFramework>net6.0</TargetFramework>
                <LangVersion>latest</LangVersion>
                <ImplicitUsings>enable</ImplicitUsings>
                <Nullable>enable</Nullable>
                <AssemblyName>ProbeCrossAssemblyEntry</AssemblyName>
                <RestoreIgnoreFailedSources>true</RestoreIgnoreFailedSources>
              </PropertyGroup>
              <ItemGroup>
                <ProjectReference Include="{escapedHelperProject}" />
                <Reference Include="StardewModdingAPI">
                  <HintPath>{escapedSmapiAssembly}</HintPath>
                  <Private>false</Private>
                </Reference>
              </ItemGroup>
            </Project>
            """);
        File.WriteAllText(
            Path.Combine(entryRoot, "CrossAssemblyMod.cs"),
            """
            using StardewModdingAPI;

            namespace CrossAssemblyFixture;

            [AttributeUsage(AttributeTargets.Method)]
            internal sealed class SubscriberAttribute : Attribute;

            public sealed class CrossAssemblyMod : Mod
            {
                public override void Entry(IModHelper helper)
                {
                }

                [Subscriber]
                private void OnGameLaunched(object? sender, EventArgs e)
                {
                    _ = new RegistrationBootstrap(null!);
                }
            }
            """);

        RunDotnetBuild(entryProject, outputRoot);
        Assert(
            File.Exists(Path.Combine(outputRoot, "ProbeCrossAssemblyEntry.dll"))
                && File.Exists(Path.Combine(outputRoot, "ProbeCrossAssemblyHelper.dll")),
            "cross-assembly fixture build did not produce both assemblies");
        return outputRoot;
    }

    private static void RunDotnetBuild(string project, string output)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = "dotnet",
            WorkingDirectory = Path.GetDirectoryName(project)!,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
        };
        foreach (var argument in new[]
                 {
                     "build",
                     project,
                     "--configuration",
                     "Release",
                     "--nologo",
                     "--output",
                     output,
                 })
        {
            startInfo.ArgumentList.Add(argument);
        }
        startInfo.Environment["DOTNET_CLI_TELEMETRY_OPTOUT"] = "1";
        startInfo.Environment["DOTNET_SKIP_FIRST_TIME_EXPERIENCE"] = "1";

        using var process = Process.Start(startInfo)
            ?? throw new InvalidOperationException("Could not start dotnet for the cross-assembly fixture build.");
        var standardOutput = process.StandardOutput.ReadToEndAsync();
        var standardError = process.StandardError.ReadToEndAsync();
        if (!process.WaitForExit(60_000))
        {
            process.Kill(entireProcessTree: true);
            process.WaitForExit();
            throw new TimeoutException("Cross-assembly fixture build timed out.");
        }

        Task.WaitAll(standardOutput, standardError);
        if (process.ExitCode != 0)
        {
            throw new InvalidOperationException(
                $"Cross-assembly fixture build failed with exit code {process.ExitCode}:\n{standardOutput.Result}\n{standardError.Result}");
        }
    }

    private static string CreateTempDirectory(string name)
    {
        var path = Path.Combine(Path.GetTempPath(), $"modforge-gmcm-self-test-{name}-{Guid.NewGuid():N}");
        Directory.CreateDirectory(path);
        return path;
    }

    private static void DeleteDirectory(string path)
    {
        try
        {
            Directory.Delete(path, recursive: true);
        }
        catch
        {
            // The process is short-lived and temp cleanup must not hide the actual assertion result.
        }
    }

    private static void Assert(bool condition, string message)
    {
        if (!condition)
        {
            throw new InvalidOperationException($"GMCM probe self-test failed: {message}");
        }
    }
}

internal interface IProbeSelfTestEvents
{
    event EventHandler GameLaunched;
}

internal ref struct ProbeSelfTestVerboseHandler;

internal interface IProbeRefStructMonitor
{
    bool IsVerbose { get; }

    void VerboseLog(ref ProbeSelfTestVerboseHandler handler);

    internal IProbeRefStructMonitor GetBaseAssetName();
}

internal sealed class ProbeSelfTestMod : StardewModdingAPI.Mod
{
    private ProbeSelfTestConfig Config = new();

    public override void Entry(StardewModdingAPI.IModHelper helper)
    {
        ReachableSetupMenu(null!);
        helper.Events.GameLoop.GameLaunched += OnGameLaunched;
    }

    private void OnGameLaunched(object? sender, StardewModdingAPI.Events.GameLaunchedEventArgs e)
    {
        var api = Helper.ModRegistry.GetApi<IProbeGenericModConfigMenuApi>("spacechase0.GenericModConfigMenu");
        api?.Register(ModManifest, () => Config = new ProbeSelfTestConfig(), () => { });
    }

    private void ReachableSetupMenu(IProbeGenericModConfigMenuApi api)
    {
        api.Register(ModManifest, () => Config = new ProbeSelfTestConfig(), () => { });
        api.AddBoolOption(
            ModManifest,
            () => Config.SerializedEnabled,
            value => Config.SerializedEnabled = value,
            () => "Enabled",
            () => "Enabled tooltip",
            "enabled-ui");
    }

    private void DeadLegacyMenu(IProbeGenericModConfigMenuApi api)
    {
        api.Register(ModManifest, () => Config = new ProbeSelfTestConfig(), () => { });
        api.AddBoolOption(
            ModManifest,
            () => Config.Other,
            value => Config.Other = value,
            () => "Legacy",
            () => "Legacy tooltip",
            "legacy-ui");
    }
}

internal sealed class ProbeSelfTestConfig
{
    [JsonPropertyName("serialized_enabled")]
    public bool SerializedEnabled { get; set; }

    [JsonPropertyName("show_advanced")]
    public bool ShowAdvanced { get; set; }

    public bool Other { get; set; }

    [JsonIgnore]
    public bool IgnoredSystemText { get; set; }

    [Newtonsoft.Json.JsonIgnore]
    public bool IgnoredNewtonsoft { get; set; }

    [JsonPropertyName("public_value")]
    public string PublicValue = "";
}

internal static class ProbeStaticCandidateState
{
    internal static StardewModdingAPI.IModHelper? Helper;
    internal static ProbeSelfTestConfig? ModConfig;
}

internal interface IProbeGenericModConfigMenuApi
{
    void Register(StardewModdingAPI.IManifest mod, Action reset, Action save);

    void AddBoolOption(
        StardewModdingAPI.IManifest mod,
        Func<bool> getValue,
        Action<bool> setValue,
        Func<string> name,
        Func<string> tooltip,
        string fieldId);
}

namespace Newtonsoft.Json
{
    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property)]
    internal sealed class JsonIgnoreAttribute : Attribute
    {
    }
}
