using System.Reflection;
using System.Reflection.Emit;

namespace HarmonyLib;

public sealed class CodeInstruction
{
    public CodeInstruction()
    {
    }

    public CodeInstruction(OpCode opcode, object? operand = null)
    {
        this.opcode = opcode;
        this.operand = operand;
    }

    public CodeInstruction(CodeInstruction instruction)
    {
        opcode = instruction.opcode;
        operand = instruction.operand;
        labels = [.. instruction.labels];
        blocks = [.. instruction.blocks];
    }

    public OpCode opcode;
    public object? operand;
    public List<Label> labels = [];
    public List<ExceptionBlock> blocks = [];

    public bool Calls(MethodInfo method)
    {
        return ReferenceEquals(operand, method);
    }
}

public struct ExceptionBlock(ExceptionBlockType blockType, Type? catchType = null)
{
    public ExceptionBlockType blockType = blockType;
    public Type? catchType = catchType;
}

public enum ExceptionBlockType
{
    BeginExceptionBlock,
    BeginCatchBlock,
    BeginExceptFilterBlock,
    BeginFaultBlock,
    BeginFinallyBlock,
    EndExceptionBlock
}

public sealed class CodeMatcher(IEnumerable<CodeInstruction> instructions)
{
    public List<CodeInstruction> Instructions { get; } = instructions.ToList();
    public bool IsValid => true;
    public CodeInstruction Instruction => Instructions.FirstOrDefault() ?? new CodeInstruction();

    public CodeMatcher MatchStartForward(params CodeMatch[] matches)
    {
        return this;
    }

    public CodeMatcher MatchEndForward(params CodeMatch[] matches)
    {
        return this;
    }

    public CodeMatcher Advance(int offset)
    {
        return this;
    }

    public CodeMatcher Insert(params CodeInstruction[] instructions)
    {
        Instructions.AddRange(instructions);
        return this;
    }

    public CodeMatcher RemoveInstruction()
    {
        if (Instructions.Count > 0)
        {
            Instructions.RemoveAt(0);
        }
        return this;
    }

    public IEnumerable<CodeInstruction> InstructionEnumeration()
    {
        return Instructions;
    }
}

public sealed class CodeMatch(OpCode? opcode = null, object? operand = null, string? name = null)
{
    public OpCode? opcode = opcode;
    public object? operand = operand;
    public string? name = name;
}
