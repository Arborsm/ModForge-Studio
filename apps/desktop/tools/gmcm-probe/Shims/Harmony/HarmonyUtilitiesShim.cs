using System.Collections;
using System.Linq.Expressions;
using System.Reflection;
using System.Reflection.Emit;

namespace HarmonyLib;

public sealed class Traverse
{
    private readonly object? target;
    private readonly Type? type;

    private Traverse(object? target, Type? type)
    {
        this.target = target;
        this.type = type;
    }

    public static Traverse Create(object target)
    {
        return new Traverse(target, target.GetType());
    }

    public static Traverse Create(Type type)
    {
        return new Traverse(null, type);
    }

    public Traverse Field(string name)
    {
        return this;
    }

    public Traverse Property(string name)
    {
        return this;
    }

    public Traverse Method(string name, params object[] arguments)
    {
        return this;
    }

    public object? GetValue()
    {
        return target;
    }

    public T? GetValue<T>()
    {
        return target is T value ? value : default;
    }

    public Traverse SetValue(object? value)
    {
        return this;
    }
}

public static class FileLog
{
    public static void Log(string str)
    {
    }

    public static void Reset()
    {
    }
}

public static class Priority
{
    public const int First = 800;
    public const int VeryHigh = 600;
    public const int High = 400;
    public const int HigherThanNormal = 200;
    public const int Normal = 0;
    public const int LowerThanNormal = -200;
    public const int Low = -400;
    public const int VeryLow = -600;
    public const int Last = -800;
}

public enum HarmonyPatchType
{
    All,
    Prefix,
    Postfix,
    Transpiler,
    Finalizer,
    ReversePatch
}

public enum HarmonyReversePatchType
{
    Original,
    Snapshot,
    Standin
}

public enum MethodType
{
    Normal,
    Getter,
    Setter,
    Constructor,
    StaticConstructor,
    Enumerator
}

public enum ArgumentType
{
    Normal,
    Ref,
    Out,
    Pointer
}
