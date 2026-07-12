internal class RuntimeGmcmApiProxy : DispatchProxy
{
    private ProbeState? state;

    public static object Create(Type apiType, ProbeState state)
    {
        using var contextualReflection = AssemblyLoadContext.EnterContextualReflection(apiType.Assembly);
        var create = typeof(DispatchProxy)
            .GetMethods(BindingFlags.Public | BindingFlags.Static)
            .Single(method => method.Name == nameof(DispatchProxy.Create) && method.GetGenericArguments().Length == 2)
            .MakeGenericMethod(apiType, typeof(RuntimeGmcmApiProxy));
        var proxy = create.Invoke(null, null) ?? throw new InvalidOperationException($"Failed to create GMCM proxy for {apiType.FullName}.");
        ((RuntimeGmcmApiProxy)proxy).state = state;
        return proxy;
    }

    protected override object? Invoke(MethodInfo? targetMethod, object?[]? args)
    {
        if (targetMethod is null || state is null)
        {
            return null;
        }

        state.NoteGmcmInteraction();
        return GmcmCapture.Invoke(targetMethod, args ?? [], state);
    }
}

internal static class GmcmCapture
{
    private const int MaxTargetTraversalDepth = 8;
    private static readonly System.Runtime.CompilerServices.ConditionalWeakTable<ProbeState, CaptureSession> Sessions = new();

    internal readonly record struct Checkpoint(
        int FieldCount,
        int GmcmFieldCount,
        string? Section,
        string? Page);

    internal static Checkpoint BeginAttempt(ProbeState state)
    {
        Sessions.GetOrCreateValue(state).Reset();
        var checkpoint = new Checkpoint(
            state.Fields.Count,
            state.GmcmFieldsCaptured,
            state.CurrentSection,
            state.CurrentPage);
        state.CurrentSection = null;
        state.CurrentPage = null;
        return checkpoint;
    }

    internal static void RollBack(ProbeState state, Checkpoint checkpoint)
    {
        if (state.Fields.Count > checkpoint.FieldCount)
        {
            state.Fields.RemoveRange(checkpoint.FieldCount, state.Fields.Count - checkpoint.FieldCount);
        }
        state.GmcmFieldsCaptured = checkpoint.GmcmFieldCount;
        state.CurrentSection = checkpoint.Section;
        state.CurrentPage = checkpoint.Page;
        Sessions.GetOrCreateValue(state).Reset();
    }

    internal static int CapturedSince(ProbeState state, Checkpoint checkpoint)
    {
        return Math.Max(0, state.GmcmFieldsCaptured - checkpoint.GmcmFieldCount);
    }

    internal static void Commit(ProbeState state)
    {
        var session = Sessions.GetOrCreateValue(state);
        foreach (var registration in session.Registrations)
        {
            if (registration.Reset is null)
            {
                if (registration.Fields.Count > 0)
                {
                    state.NoteAssemblyLoad("GMCM Register did not expose a reset callback; captured defaults remain unknown.");
                }
                continue;
            }

            registration.Reset.DynamicInvoke();
            foreach (var pending in registration.Fields)
            {
                if (pending.FieldIndex < 0 || pending.FieldIndex >= state.Fields.Count)
                {
                    continue;
                }
                if (!state.Fields[pending.FieldIndex].StorageKeyReliable)
                {
                    state.Fields[pending.FieldIndex] = state.Fields[pending.FieldIndex] with
                    {
                        DefaultValue = null,
                    };
                    continue;
                }
                var value = EvaluateDefault(pending.Getter);
                state.Fields[pending.FieldIndex] = state.Fields[pending.FieldIndex] with
                {
                    DefaultValue = NormalizeValue(value),
                };
            }
        }
        session.Reset();
    }

    public static object? Invoke(MethodInfo targetMethod, object?[] args, ProbeState state)
    {
        try
        {
            switch (targetMethod.Name)
            {
                case "Register":
                    CaptureReset(targetMethod, args, state);
                    return RuntimeDefaultFactory.Create(targetMethod.ReturnType);
                case "AddSectionTitle":
                case "AddSubHeader":
                    state.CurrentSection = EvaluateString(GetArg(args, 1)) ?? state.CurrentSection;
                    return RuntimeDefaultFactory.Create(targetMethod.ReturnType);
                case "AddParagraph":
                    return RuntimeDefaultFactory.Create(targetMethod.ReturnType);
                case "AddPage":
                    state.CurrentPage = GetArg(args, 1)?.ToString();
                    state.CurrentSection = EvaluateString(GetArg(args, 2)) ?? state.CurrentPage;
                    return RuntimeDefaultFactory.Create(targetMethod.ReturnType);
                case "AddBoolOption":
                    CaptureOption(targetMethod, args, "boolean", state, allowedValues: [false, true]);
                    return RuntimeDefaultFactory.Create(targetMethod.ReturnType);
                case "AddNumberOption":
                    CaptureNumberOption(targetMethod, args, state);
                    return RuntimeDefaultFactory.Create(targetMethod.ReturnType);
                case "AddTextOption":
                    CaptureTextOption(targetMethod, args, state);
                    return RuntimeDefaultFactory.Create(targetMethod.ReturnType);
                case "AddKeybind":
                case "AddKeybindList":
                    CaptureOption(
                        targetMethod,
                        args,
                        targetMethod.Name == "AddKeybindList" ? "string-array" : "string",
                        state,
                        uiHint: targetMethod.Name == "AddKeybindList" ? "keybind-list" : "keybind");
                    return RuntimeDefaultFactory.Create(targetMethod.ReturnType);
                case "AddColorOption":
                    CaptureOption(targetMethod, args, "string", state, uiHint: "color");
                    return RuntimeDefaultFactory.Create(targetMethod.ReturnType);
                default:
                    return RuntimeDefaultFactory.Create(targetMethod.ReturnType);
            }
        }
        catch (Exception ex)
        {
            state.FailureStage ??= $"gmcm:{targetMethod.Name}";
            throw new InvalidOperationException(
                $"GMCM method {targetMethod.Name} could not be captured: {ex.GetBaseException().Message}",
                ex);
        }
    }

    private static void CaptureReset(MethodInfo method, object?[] args, ProbeState state)
    {
        var parameters = method.GetParameters();
        Delegate? reset = null;
        for (var index = 0; index < parameters.Length && index < args.Length; index++)
        {
            if (args[index] is Delegate callback
                && callback.Method.GetParameters().Length == 0
                && callback.Method.ReturnType == typeof(void)
                && parameters[index].Name?.Contains("reset", StringComparison.OrdinalIgnoreCase) == true)
            {
                reset = callback;
                break;
            }
        }

        reset ??= args
            .OfType<Delegate>()
            .FirstOrDefault(callback => callback.Method.GetParameters().Length == 0
                && callback.Method.ReturnType == typeof(void));
        Sessions.GetOrCreateValue(state).BeginRegistration(reset);
    }

    private static void CaptureNumberOption(MethodInfo method, object?[] args, ProbeState state)
    {
        var parsed = GmcmMethodArgs.Parse(method, args);
        var valueType = (parsed.GetValue as Delegate)?.Method.ReturnType;
        var fieldType = valueType is not null && IsFloatingPointType(valueType) ? "number" : "integer";
        var allowValues = BuildNumericAllowValues(parsed.Min, parsed.Max, parsed.Interval);
        CaptureOption(parsed, fieldType, state, allowedValues: allowValues);
    }

    private static void CaptureTextOption(MethodInfo method, object?[] args, ProbeState state)
    {
        var parsed = GmcmMethodArgs.Parse(method, args);
        var allowed = parsed.AllowedValues switch
        {
            string[] values => values.Cast<object?>().ToList(),
            IEnumerable<string> values => values.Cast<object?>().ToList(),
            _ => []
        };
        CaptureOption(parsed, "string", state, allowedValues: allowed);
    }

    private static void CaptureOption(
        MethodInfo method,
        object?[] args,
        string fieldType,
        ProbeState state,
        object? defaultValue = null,
        List<object?>? allowedValues = null,
        string? uiHint = null)
    {
        CaptureOption(GmcmMethodArgs.Parse(method, args), fieldType, state, defaultValue, allowedValues, uiHint);
    }

    private static void CaptureOption(
        GmcmMethodArgs args,
        string fieldType,
        ProbeState state,
        object? defaultValue = null,
        List<object?>? allowedValues = null,
        string? uiHint = null)
    {
        var getValue = args.GetValue;
        var inferredKey = InferStorageKey(getValue);
        var explicitFieldId = NormalizeFieldId(args.FieldId);
        var capturedFieldId = NormalizeFieldId(InferCapturedFieldId(getValue));
        var label = EvaluateString(args.Name) ?? HumanizeKey(explicitFieldId) ?? HumanizeKey(inferredKey) ?? "Config option";
        var storageKey = inferredKey ?? explicitFieldId ?? capturedFieldId ?? SanitizeKey(label);
        if (inferredKey is null && (explicitFieldId ?? capturedFieldId) is { } fallbackFieldId)
        {
            state.NoteAssemblyLoad($"GMCM field ID '{fallbackFieldId}' is being used as the config key because its backing config member could not be inferred.");
        }
        else if (inferredKey is null)
        {
            state.NoteAssemblyLoad($"GMCM option '{label}' is using label-derived config key '{storageKey}' because its backing config member and field ID could not be inferred.");
        }
        var fieldCountBefore = state.Fields.Count;
        state.AddField(new ProbeField(
            storageKey,
            label,
            EvaluateString(args.Tooltip),
            state.CurrentSection ?? state.CurrentPage,
            fieldType,
            NormalizeValue(defaultValue),
            allowedValues ?? [],
            fieldType == "string",
            fieldType == "string-array",
            "generic-mod-config-menu",
            uiHint,
            inferredKey is not null));
        if (state.Fields.Count > fieldCountBefore && state.Fields[^1].StorageKeyReliable)
        {
            Sessions.GetOrCreateValue(state).TrackDefault(state.Fields.Count - 1, getValue);
        }
    }

    private sealed record GmcmMethodArgs(
        object? GetValue,
        object? Name,
        object? Tooltip,
        string? FieldId,
        object? AllowedValues,
        object? Min,
        object? Max,
        object? Interval)
    {
        public static GmcmMethodArgs Parse(MethodInfo method, object?[] args)
        {
            var parameters = method.GetParameters();
            object? getValue = null;
            object? name = null;
            object? tooltip = null;
            string? fieldId = null;
            object? allowedValues = null;
            object? min = null;
            object? max = null;
            object? interval = null;

            for (var index = 0; index < args.Length && index < parameters.Length; index++)
            {
                var parameter = parameters[index];
                var value = args[index];
                var parameterName = parameter.Name ?? "";
                if (IsNamed(parameterName, "getValue", "get", "valueGetter"))
                {
                    getValue = value;
                }
                else if (IsNamed(parameterName, "name", "text", "label", "title"))
                {
                    name = value;
                }
                else if (IsNamed(parameterName, "tooltip", "description", "desc"))
                {
                    tooltip = value;
                }
                else if (IsNamed(parameterName, "fieldId", "fieldName", "id"))
                {
                    fieldId = value as string;
                }
                else if (IsNamed(parameterName, "allowedValues", "allowed", "choices", "values"))
                {
                    allowedValues = value;
                }
                else if (IsNamed(parameterName, "min", "minimum"))
                {
                    min = value;
                }
                else if (IsNamed(parameterName, "max", "maximum"))
                {
                    max = value;
                }
                else if (IsNamed(parameterName, "interval", "step"))
                {
                    interval = value;
                }
            }

            getValue ??= FindGetter(method, args);
            name ??= FindDisplayDelegate(method, args, getValue, preferTooltip: false);
            tooltip ??= FindDisplayDelegate(method, args, getValue, preferTooltip: true);
            fieldId ??= FindFieldId(method, args);
            allowedValues ??= FindAllowedValues(args);
            (min, max, interval) = FindNumberRange(args, min, max, interval);
            return new GmcmMethodArgs(getValue, name, tooltip, fieldId, allowedValues, min, max, interval);
        }

        private static object? FindGetter(MethodInfo method, object?[] args)
        {
            var valueType = method.Name switch
            {
                "AddBoolOption" => typeof(bool),
                "AddTextOption" => typeof(string),
                "AddKeybind" => typeof(string),
                _ => null
            };
            return args.OfType<Delegate>()
                .FirstOrDefault(callback => callback.Method.GetParameters().Length == 0
                    && callback.Method.ReturnType != typeof(void)
                    && (valueType is null
                        || callback.Method.ReturnType == valueType
                        || callback.Method.ReturnType.FullName == "StardewModdingAPI.Utilities.KeybindList"
                        || IsNumericType(callback.Method.ReturnType)));
        }

        private static object? FindDisplayDelegate(MethodInfo method, object?[] args, object? getValue, bool preferTooltip)
        {
            var stringDelegates = args
                .OfType<Delegate>()
                .Where(callback => !ReferenceEquals(callback, getValue)
                    && callback.Method.GetParameters().Length == 0
                    && callback.Method.ReturnType == typeof(string))
                .ToList();
            if (stringDelegates.Count == 0)
            {
                return null;
            }

            return preferTooltip
                ? stringDelegates.Skip(1).FirstOrDefault()
                : stringDelegates.FirstOrDefault();
        }

        private static string? FindFieldId(MethodInfo method, object?[] args)
        {
            foreach (var value in args.OfType<string>().Reverse())
            {
                if (NormalizeFieldId(value) is { } fieldId)
                {
                    return fieldId;
                }
            }
            return null;
        }

        private static object? FindAllowedValues(object?[] args)
        {
            return args.FirstOrDefault(value => value is string[] || value is IEnumerable<string>);
        }

        private static (object? Min, object? Max, object? Interval) FindNumberRange(object?[] args, object? min, object? max, object? interval)
        {
            if (min is not null && max is not null)
            {
                return (min, max, interval);
            }

            var numericValues = args
                .Where(value => value is not null && IsNumericType(value.GetType()))
                .ToList();
            if (numericValues.Count >= 2)
            {
                min ??= numericValues[0];
                max ??= numericValues[1];
                interval ??= numericValues.Skip(2).FirstOrDefault();
            }
            return (min, max, interval);
        }

        private static bool IsNamed(string actual, params string[] expected)
        {
            return expected.Any(name => actual.Equals(name, StringComparison.OrdinalIgnoreCase));
        }
    }

    private static List<object?> BuildNumericAllowValues(object? min, object? max, object? interval)
    {
        if (min is null || max is null)
        {
            return [];
        }

        if (!decimal.TryParse(min.ToString(), out var start) || !decimal.TryParse(max.ToString(), out var end))
        {
            return [];
        }

        var step = decimal.TryParse(interval?.ToString(), out var parsedInterval) && parsedInterval > 0
            ? parsedInterval
            : 1;
        if (end < start || (end - start) / step > 200)
        {
            return [];
        }

        List<object?> values = [];
        for (var value = start; value <= end; value += step)
        {
            values.Add(decimal.Truncate(value) == value ? (int)value : (double)value);
        }
        return values;
    }

    private static object? GetArg(object?[] args, int index)
    {
        return index >= 0 && index < args.Length ? args[index] : null;
    }

    private static object? EvaluateDelegate(object? value)
    {
        if (value is not Delegate callback)
        {
            return value;
        }

        return callback.DynamicInvoke();
    }

    private static string? EvaluateString(object? value)
    {
        return NormalizeValue(EvaluateDelegate(value))?.ToString();
    }

    private static string? InferStorageKey(object? getValue)
    {
        if (getValue is not Delegate callback)
        {
            return null;
        }

        if (FindPropertyForGetter(callback.Method) is { } directProperty)
        {
            return GetReliableStorageKey(directProperty);
        }

        if (InferConfigMemberFromIl(callback.Method) is { } memberFromIl)
        {
            return GetReliableStorageKey(memberFromIl);
        }

        var target = callback.Target;
        return target is null
            ? null
            : InferConfigMemberFromTarget(
                target,
                callback.Method.ReturnType,
                new HashSet<object>(ReferenceEqualityComparer.Instance),
                0) is { } inferred
                ? GetReliableStorageKey(inferred)
                : null;
    }

    private static string? GetReliableStorageKey(MemberInfo member)
    {
        return ProbeSerializedMember.IsIgnored(member)
            ? null
            : ProbeSerializedMember.GetName(member);
    }

    private static string? InferCapturedFieldId(object? getValue)
    {
        if (getValue is not Delegate { Target: { } target })
        {
            return null;
        }

        return InferFieldIdFromTarget(
            target,
            new HashSet<object>(ReferenceEqualityComparer.Instance),
            0);
    }

    private static object? EvaluateDefault(object? value)
    {
        return value is Delegate callback ? callback.DynamicInvoke() : value;
    }

    private static MemberInfo? InferConfigMemberFromIl(MethodInfo method)
    {
        try
        {
            var body = method.GetMethodBody();
            var il = body?.GetILAsByteArray();
            var module = method.Module;
            if (il is null)
            {
                return null;
            }

            HashSet<MemberInfo> members = [];
            for (var index = 0; index < il.Length;)
            {
                var opcode = ReadOpCode(il, ref index);
                if (opcode.OperandType is not OperandType.InlineMethod and not OperandType.InlineField)
                {
                    index += OperandSize(opcode.OperandType, il, index);
                    continue;
                }

                var token = BitConverter.ToInt32(il, index);
                index += 4;
                if (opcode.OperandType == OperandType.InlineMethod
                    && module.ResolveMethod(token) is MethodInfo { IsSpecialName: true } called
                    && called.Name.StartsWith("get_", StringComparison.Ordinal)
                    && IsConfigType(called.DeclaringType)
                    && FindPropertyForGetter(called) is { } property
                    && IsCompatibleValueType(property.PropertyType, method.ReturnType))
                {
                    members.Add(property);
                }
                else if (opcode.OperandType == OperandType.InlineField
                    && module.ResolveField(token) is { } field
                    && IsConfigType(field.DeclaringType)
                    && IsCompatibleValueType(field.FieldType, method.ReturnType))
                {
                    members.Add(field);
                }
            }

            return members.Count == 1 ? members.Single() : null;
        }
        catch
        {
            return null;
        }
    }

    private static OpCode ReadOpCode(byte[] il, ref int index)
    {
        var value = il[index++];
        if (value != 0xFE)
        {
            return SingleByteOpCodes[value];
        }

        return MultiByteOpCodes[il[index++]];
    }

    private static int OperandSize(OperandType operandType, byte[] il, int index)
    {
        return operandType switch
        {
            OperandType.InlineNone => 0,
            OperandType.ShortInlineBrTarget or OperandType.ShortInlineI or OperandType.ShortInlineVar => 1,
            OperandType.InlineVar => 2,
            OperandType.InlineBrTarget or OperandType.InlineField or OperandType.InlineI or OperandType.InlineMethod
                or OperandType.InlineSig or OperandType.InlineString or OperandType.InlineTok
                or OperandType.InlineType or OperandType.ShortInlineR => 4,
            OperandType.InlineSwitch => index + 4 <= il.Length ? 4 + BitConverter.ToInt32(il, index) * 4 : 4,
            OperandType.InlineI8 or OperandType.InlineR => 8,
            _ => 0
        };
    }

    private static readonly OpCode[] SingleByteOpCodes = BuildOpCodeMap(false);
    private static readonly OpCode[] MultiByteOpCodes = BuildOpCodeMap(true);

    private static OpCode[] BuildOpCodeMap(bool multiByte)
    {
        var result = new OpCode[256];
        foreach (var field in typeof(OpCodes).GetFields(BindingFlags.Public | BindingFlags.Static))
        {
            if (field.GetValue(null) is not OpCode opcode)
            {
                continue;
            }

            var value = unchecked((ushort)opcode.Value);
            if (multiByte)
            {
                if ((value & 0xFF00) == 0xFE00)
                {
                    result[value & 0xFF] = opcode;
                }
            }
            else if (value < 0x100)
            {
                result[value] = opcode;
            }
        }
        return result;
    }

    private static MemberInfo? InferConfigMemberFromTarget(
        object target,
        Type valueType,
        HashSet<object> visited,
        int depth)
    {
        if (depth >= MaxTargetTraversalDepth || !visited.Add(target))
        {
            return null;
        }

        var fields = target.GetType().GetFields(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
        foreach (var field in fields)
        {
            var value = SafeGetFieldValue(field, target);
            if (value is not null && IsConfigObject(field, value))
            {
                var member = FindMatchingConfigMember(value, valueType);
                if (member is not null)
                {
                    return member;
                }
            }
        }

        foreach (var field in fields)
        {
            var value = SafeGetFieldValue(field, target);
            if (value is null || value is string || value.GetType().IsValueType)
            {
                continue;
            }

            var nested = InferConfigMemberFromTarget(value, valueType, visited, depth + 1);
            if (nested is not null)
            {
                return nested;
            }
        }

        return null;
    }

    private static string? InferFieldIdFromTarget(
        object target,
        HashSet<object> visited,
        int depth)
    {
        if (depth >= MaxTargetTraversalDepth || !visited.Add(target))
        {
            return null;
        }

        var fields = target.GetType().GetFields(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
        foreach (var field in fields)
        {
            var value = SafeGetFieldValue(field, target);
            if (value is not null && IsLikelyFieldId(CleanMemberName(field.Name), value))
            {
                return value.ToString();
            }
        }

        foreach (var field in fields)
        {
            var value = SafeGetFieldValue(field, target);
            if (value is null || value is string || value.GetType().IsValueType)
            {
                continue;
            }

            var nested = InferFieldIdFromTarget(value, visited, depth + 1);
            if (nested is not null)
            {
                return nested;
            }
        }

        return null;
    }

    private static MemberInfo? FindMatchingConfigMember(object config, Type valueType)
    {
        List<MemberInfo> matches = [];
        const BindingFlags flags = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;
        foreach (var property in config.GetType().GetProperties(flags))
        {
            if (!property.CanRead
                || !IsCompatibleValueType(property.PropertyType, valueType)
                || property.GetMethod?.IsPublic != true && !ProbeSerializedMember.HasExplicitName(property)
                || ProbeSerializedMember.IsIgnored(property))
            {
                continue;
            }
            matches.Add(property);
        }

        foreach (var field in config.GetType().GetFields(flags))
        {
            if (IsCompatibleValueType(field.FieldType, valueType)
                && (field.IsPublic || ProbeSerializedMember.HasExplicitName(field))
                && !ProbeSerializedMember.IsIgnored(field))
            {
                matches.Add(field);
            }
        }

        return matches.Count == 1 ? matches.Single() : null;
    }

    private static PropertyInfo? FindPropertyForGetter(MethodInfo getter)
    {
        if (!getter.IsSpecialName || !getter.Name.StartsWith("get_", StringComparison.Ordinal))
        {
            return null;
        }

        return getter.DeclaringType
            ?.GetProperties(BindingFlags.Instance | BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic)
            .FirstOrDefault(property => property.GetMethod == getter);
    }

    private static bool IsConfigObject(FieldInfo holder, object value)
    {
        var holderName = CleanMemberName(holder.Name);
        return IsConfigType(value.GetType())
            || holderName.Contains("config", StringComparison.OrdinalIgnoreCase)
            || holderName.Contains("setting", StringComparison.OrdinalIgnoreCase)
            || holderName.Contains("option", StringComparison.OrdinalIgnoreCase)
            || holderName.Contains("preference", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsConfigType(Type? type)
    {
        return type is not null
            && !type.IsPrimitive
            && type != typeof(string)
            && (type.Name.Contains("Config", StringComparison.OrdinalIgnoreCase)
                || type.Name.Contains("Setting", StringComparison.OrdinalIgnoreCase)
                || type.Name.Contains("Option", StringComparison.OrdinalIgnoreCase)
                || type.Name.Contains("Preference", StringComparison.OrdinalIgnoreCase));
    }

    private static bool IsLikelyFieldId(string fieldName, object value)
    {
        return value is string text
            && NormalizeFieldId(text) is not null
            && (fieldName.Equals("id", StringComparison.OrdinalIgnoreCase)
                || fieldName.Contains("field", StringComparison.OrdinalIgnoreCase)
                || fieldName.Contains("key", StringComparison.OrdinalIgnoreCase)
                || text.StartsWith("filter.", StringComparison.OrdinalIgnoreCase)
                || text.StartsWith("config.", StringComparison.OrdinalIgnoreCase)
                || text.StartsWith("option.", StringComparison.OrdinalIgnoreCase));
    }

    private static string? NormalizeFieldId(string? value)
    {
        var fieldId = value?.Trim();
        return string.IsNullOrWhiteSpace(fieldId)
            || fieldId.Length > 160
            || fieldId.IndexOfAny(['/', '\\', '\r', '\n', '\0']) >= 0
            ? null
            : fieldId;
    }

    private static bool IsCompatibleValueType(Type memberType, Type valueType)
    {
        memberType = Nullable.GetUnderlyingType(memberType) ?? memberType;
        valueType = Nullable.GetUnderlyingType(valueType) ?? valueType;
        return memberType == valueType
            || memberType.IsEnum && valueType == typeof(string)
            || valueType.FullName == "StardewModdingAPI.Utilities.KeybindList" && memberType.FullName == valueType.FullName;
    }

    private static object? SafeGetFieldValue(FieldInfo field, object target)
    {
        try
        {
            return field.GetValue(target);
        }
        catch
        {
            return null;
        }
    }

    private static string CleanMemberName(string name)
    {
        return name.Trim('<', '>', '_');
    }

    private static bool IsNumericType(Type type)
    {
        type = Nullable.GetUnderlyingType(type) ?? type;
        return type == typeof(byte)
            || type == typeof(short)
            || type == typeof(int)
            || type == typeof(long)
            || type == typeof(float)
            || type == typeof(double)
            || type == typeof(decimal);
    }

    private static bool IsFloatingPointType(Type type)
    {
        type = Nullable.GetUnderlyingType(type) ?? type;
        return type == typeof(float) || type == typeof(double) || type == typeof(decimal);
    }

    private static string? HumanizeKey(string? key)
    {
        if (string.IsNullOrWhiteSpace(key))
        {
            return null;
        }

        List<char> result = [];
        for (var index = 0; index < key.Length; index++)
        {
            var current = key[index];
            if (index > 0 && char.IsUpper(current) && char.IsLower(key[index - 1]))
            {
                result.Add(' ');
            }
            else if (current is '_' or '-' or '.')
            {
                result.Add(' ');
                continue;
            }
            result.Add(current);
        }
        return new string(result.ToArray()).Trim();
    }

    private static string SanitizeKey(string label)
    {
        var chars = label.Where(char.IsLetterOrDigit).ToArray();
        return chars.Length == 0 ? "ConfigOption" : new string(chars);
    }

    private static object? NormalizeValue(object? value)
    {
        if (value is null)
        {
            return null;
        }
        if (value.GetType().IsEnum)
        {
            return value.ToString();
        }
        if (value is string or bool or int or long or float or double or decimal)
        {
            return value;
        }
        return value.ToString();
    }

    private sealed class CaptureSession
    {
        public List<DefaultRegistration> Registrations { get; } = [];
        private DefaultRegistration? currentRegistration;

        public void BeginRegistration(Delegate? reset)
        {
            currentRegistration = new(reset);
            Registrations.Add(currentRegistration);
        }

        public void TrackDefault(int fieldIndex, object? getter)
        {
            if (currentRegistration is null)
            {
                BeginRegistration(null);
            }
            currentRegistration!.Fields.Add(new(fieldIndex, getter));
        }

        public void Reset()
        {
            Registrations.Clear();
            currentRegistration = null;
        }
    }

    private sealed record PendingDefault(int FieldIndex, object? Getter);
    private sealed record DefaultRegistration(Delegate? Reset)
    {
        public List<PendingDefault> Fields { get; } = [];
    }

}
