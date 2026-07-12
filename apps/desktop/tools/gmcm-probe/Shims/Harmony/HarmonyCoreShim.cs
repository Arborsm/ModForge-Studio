using System.Reflection;

namespace HarmonyLib;

public sealed class Harmony(string id)
{
    public string Id { get; } = id;

    public void PatchAll()
    {
    }

    public void PatchAll(Assembly assembly)
    {
    }

    public void PatchAll(Type type)
    {
    }

    public MethodInfo? Patch(
        MethodBase original,
        HarmonyMethod? prefix = null,
        HarmonyMethod? postfix = null,
        HarmonyMethod? transpiler = null,
        HarmonyMethod? finalizer = null)
    {
        return original as MethodInfo;
    }

    public void UnpatchAll()
    {
    }

    public void UnpatchAll(string harmonyID)
    {
    }

    public void Unpatch(MethodBase original, HarmonyPatchType type, string harmonyID)
    {
    }

    public void Unpatch(MethodBase original, MethodInfo patch)
    {
    }

    public static IEnumerable<MethodBase> GetAllPatchedMethods()
    {
        return [];
    }

    public static PatchInfo? GetPatchInfo(MethodBase method)
    {
        return new PatchInfo();
    }
}
