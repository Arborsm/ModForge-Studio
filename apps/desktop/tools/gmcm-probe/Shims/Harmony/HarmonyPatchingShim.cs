using System.Reflection;
using System.Collections.ObjectModel;

namespace HarmonyLib;

public sealed class PatchProcessor
{
    public PatchProcessor(
        Harmony instance,
        MethodBase original,
        HarmonyMethod? prefix = null,
        HarmonyMethod? postfix = null,
        HarmonyMethod? transpiler = null,
        HarmonyMethod? finalizer = null)
    {
        Original = original;
    }

    public MethodBase Original { get; }

    public MethodInfo? Patch()
    {
        return Original as MethodInfo;
    }

    public PatchProcessor AddPrefix(HarmonyMethod fix)
    {
        return this;
    }

    public PatchProcessor AddPostfix(HarmonyMethod fix)
    {
        return this;
    }

    public PatchProcessor AddTranspiler(HarmonyMethod fix)
    {
        return this;
    }

    public PatchProcessor AddFinalizer(HarmonyMethod fix)
    {
        return this;
    }

    public static IEnumerable<MethodBase> GetAllPatchedMethods()
    {
        return [];
    }

    public static Patches GetPatchInfo(MethodBase method)
    {
        return new([], [], [], []);
    }
}

public sealed class PatchInfo
{
    public List<Patch> Prefixes { get; } = [];
    public List<Patch> Postfixes { get; } = [];
    public List<Patch> Transpilers { get; } = [];
    public List<Patch> Finalizers { get; } = [];
}

public sealed class Patches
{
    public readonly ReadOnlyCollection<Patch> Prefixes;
    public readonly ReadOnlyCollection<Patch> Postfixes;
    public readonly ReadOnlyCollection<Patch> Transpilers;
    public readonly ReadOnlyCollection<Patch> Finalizers;

    public Patches(Patch[] prefixes, Patch[] postfixes, Patch[] transpilers, Patch[] finalizers)
    {
        Prefixes = Array.AsReadOnly(prefixes ?? []);
        Postfixes = Array.AsReadOnly(postfixes ?? []);
        Transpilers = Array.AsReadOnly(transpilers ?? []);
        Finalizers = Array.AsReadOnly(finalizers ?? []);
    }

    public ReadOnlyCollection<string> Owners => Array.AsReadOnly(
        Prefixes
            .Concat(Postfixes)
            .Concat(Transpilers)
            .Concat(Finalizers)
            .Select(patch => patch.owner)
            .Distinct(StringComparer.Ordinal)
            .ToArray());
}

public sealed class Patch
{
    public readonly int index;
    public readonly string owner;
    public readonly int priority;
    public readonly string[] before;
    public readonly string[] after;
    public readonly bool debug;
    private MethodInfo? patchMethod;
    private int methodToken;
    private string? moduleGUID;

    public Patch(
        MethodInfo patch,
        int index,
        string owner,
        int priority,
        string[] before,
        string[] after,
        bool debug = false)
    {
        patchMethod = patch;
        methodToken = patch.MetadataToken;
        moduleGUID = patch.Module.ModuleVersionId.ToString();
        this.index = index;
        this.owner = owner;
        this.priority = priority;
        this.before = before ?? [];
        this.after = after ?? [];
        this.debug = debug;
    }

    public Patch(HarmonyMethod method, int index, string owner)
        : this(
            method.methodInfo ?? throw new ArgumentException("HarmonyMethod does not define a patch method.", nameof(method)),
            index,
            owner,
            method.priority,
            method.before ?? [],
            method.after ?? [],
            method.debug ?? false)
    {
    }

    public Patch(
        int index,
        string owner,
        int priority,
        string[] before,
        string[] after,
        bool debug,
        int methodToken,
        string moduleGUID)
    {
        this.index = index;
        this.owner = owner;
        this.priority = priority;
        this.before = before ?? [];
        this.after = after ?? [];
        this.debug = debug;
        this.methodToken = methodToken;
        this.moduleGUID = moduleGUID;
    }

    public MethodInfo PatchMethod => patchMethod!;
}
