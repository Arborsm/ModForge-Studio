using System.Collections;
using System.Linq.Expressions;
using System.Reflection;
using System.Reflection.Emit;

namespace HarmonyLib;

public static class SymbolExtensions
{
    public static MethodInfo? GetMethodInfo(Expression<Action> expression)
    {
        return TryGetMethodInfo(expression);
    }

    public static MethodInfo? GetMethodInfo<T>(this Expression<Action<T>> expression)
    {
        return TryGetMethodInfo(expression);
    }

    public static MethodInfo? GetMethodInfo<T, TResult>(Expression<Func<T, TResult>> expression)
    {
        return TryGetMethodInfo(expression);
    }

    public static MethodInfo? GetMethodInfo<TResult>(Expression<Func<TResult>> expression)
    {
        return TryGetMethodInfo(expression);
    }

    private static MethodInfo? TryGetMethodInfo(LambdaExpression expression)
    {
        return expression.Body switch
        {
            MethodCallExpression call => call.Method,
            UnaryExpression { Operand: MethodCallExpression call } => call.Method,
            _ => null
        };
    }

    public static CodeInstruction WithLabels(this CodeInstruction instruction, params Label[] labels)
    {
        instruction.labels.AddRange(labels);
        return instruction;
    }

    public static CodeInstruction WithLabels(this CodeInstruction instruction, IEnumerable<Label> labels)
    {
        instruction.labels.AddRange(labels);
        return instruction;
    }

    public static CodeInstruction WithBlocks(this CodeInstruction instruction, params ExceptionBlock[] blocks)
    {
        instruction.blocks.AddRange(blocks);
        return instruction;
    }

    public static CodeInstruction WithBlocks(this CodeInstruction instruction, IEnumerable<ExceptionBlock> blocks)
    {
        instruction.blocks.AddRange(blocks);
        return instruction;
    }
}

public static class GeneralExtensions
{
    public static T GetValueSafe<T>(this T value)
    {
        return value;
    }

    public static string FullDescription(this MethodBase member)
    {
        return member.ToString() ?? member.Name;
    }

    public static string FullDescription(this Type type)
    {
        return type.FullName ?? type.Name;
    }
}

public static class MethodBaseExtensions
{
    public static bool HasMethodBody(this MethodBase method)
    {
        return method.GetMethodBody() is not null;
    }

    public static MethodInfo? GetMethodInfo(this MethodBase method)
    {
        return method as MethodInfo;
    }

    public static MethodBase GetOriginalMethod(this MethodBase method)
    {
        return method;
    }
}
