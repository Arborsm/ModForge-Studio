using System.Reflection;

namespace HarmonyLib;


[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = true)]
public class HarmonyPatch : Attribute
{
    public HarmonyPatch()
    {
    }

    public HarmonyPatch(Type declaringType)
    {
        DeclaringType = declaringType;
    }

    public HarmonyPatch(Type declaringType, string methodName)
    {
        DeclaringType = declaringType;
        MethodName = methodName;
    }

    public HarmonyPatch(Type declaringType, string methodName, Type[] argumentTypes)
    {
        DeclaringType = declaringType;
        MethodName = methodName;
        ArgumentTypes = argumentTypes;
    }

    public HarmonyPatch(string methodName)
    {
        MethodName = methodName;
    }

    public HarmonyPatch(string methodName, Type[] argumentTypes)
    {
        MethodName = methodName;
        ArgumentTypes = argumentTypes;
    }

    public HarmonyPatch(MethodType methodType)
    {
        MethodType = methodType;
    }

    public HarmonyPatch(Type[] argumentTypes)
    {
        ArgumentTypes = argumentTypes;
    }

    public Type? DeclaringType { get; set; }
    public string? MethodName { get; set; }
    public Type[]? ArgumentTypes { get; set; }
    public MethodType? MethodType { get; set; }
}

[AttributeUsage(AttributeTargets.Method)]
public sealed class HarmonyPrefix : Attribute;

[AttributeUsage(AttributeTargets.Method)]
public sealed class HarmonyPostfix : Attribute;

[AttributeUsage(AttributeTargets.Method)]
public sealed class HarmonyTranspiler : Attribute;

[AttributeUsage(AttributeTargets.Method)]
public sealed class HarmonyFinalizer : Attribute;

[AttributeUsage(AttributeTargets.Method)]
public sealed class HarmonyReversePatch : Attribute
{
    public HarmonyReversePatch()
    {
    }

    public HarmonyReversePatch(HarmonyReversePatchType type)
    {
        Type = type;
    }

    public HarmonyReversePatchType Type { get; set; }
}

[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class HarmonyPriority(int priority) : Attribute
{
    public int Priority { get; } = priority;
}

[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = true)]
public sealed class HarmonyBefore(params string[] before) : Attribute
{
    public string[] Before { get; } = before;
}

[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = true)]
public sealed class HarmonyAfter(params string[] after) : Attribute
{
    public string[] After { get; } = after;
}

[AttributeUsage(AttributeTargets.Parameter)]
public sealed class HarmonyArgument : Attribute
{
    public HarmonyArgument(string name)
    {
        OriginalName = name;
    }

    public HarmonyArgument(int index)
    {
        Index = index;
    }

    public string? OriginalName { get; }
    public int Index { get; }
}

public sealed class HarmonyMethod : Attribute
{
    public HarmonyMethod()
    {
    }

    public HarmonyMethod(MethodInfo method)
    {
        methodInfo = method;
    }

    public HarmonyMethod(MethodInfo method, int priority, string[]? before = null, string[]? after = null, bool? debug = null)
    {
        methodInfo = method;
        this.priority = priority;
        this.before = before;
        this.after = after;
        this.debug = debug;
    }

    public HarmonyMethod(Type type, string name)
    {
        declaringType = type;
        methodName = name;
    }

    public HarmonyMethod(Type type, string name, Type[] argumentTypes)
    {
        declaringType = type;
        methodName = name;
        this.argumentTypes = argumentTypes;
    }

    public MethodInfo? methodInfo;
    public Type? declaringType;
    public string? methodName;
    public Type[]? argumentTypes;
    public int priority = Priority.Normal;
    public string[]? before;
    public string[]? after;
    public bool? debug;

    public static HarmonyMethod? Merge(HarmonyMethod? master, HarmonyMethod? detail)
    {
        return detail ?? master;
    }
}
