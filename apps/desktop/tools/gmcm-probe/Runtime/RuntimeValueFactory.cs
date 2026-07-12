internal static class RuntimeValueFactory
{
    public static object? CreateDefaultInstance(Type type)
    {
        try
        {
            var constructor = type.GetConstructor(Type.EmptyTypes);
            if (constructor is not null)
            {
                return Activator.CreateInstance(type);
            }

#pragma warning disable SYSLIB0050
            return FormatterServices.GetUninitializedObject(type);
#pragma warning restore SYSLIB0050
        }
        catch
        {
            return null;
        }
    }

    public static object? CreateConfigInstance(Type type, string modPath)
    {
        if (ProbePathSafety.TryResolveRelativeFileWithinRoot(
            modPath,
            "config.json",
            out var configPath,
            out _))
        {
            try
            {
                return ProbeJson.Deserialize(File.ReadAllText(configPath), type) ?? CreateDefaultInstance(type);
            }
            catch
            {
                // Fall back to the type's own defaults when config.json doesn't match this helper type.
            }
        }

        return CreateDefaultInstance(type);
    }

    public static object? CreateDelegate(Type delegateType, string modPath)
    {
        try
        {
            var invoke = delegateType.GetMethod("Invoke");
            if (invoke is null)
            {
                return null;
            }

            var parameters = invoke.GetParameters()
                .Select(parameter => System.Linq.Expressions.Expression.Parameter(parameter.ParameterType, parameter.Name))
                .ToArray();
            System.Linq.Expressions.Expression body;
            if (invoke.ReturnType == typeof(void))
            {
                body = System.Linq.Expressions.Expression.Empty();
            }
            else if (invoke.ReturnType.Name.Contains("Config", StringComparison.OrdinalIgnoreCase))
            {
                var value = CreateConfigInstance(invoke.ReturnType, modPath);
                if (value is null)
                {
                    return null;
                }
                FillNullMembers(value);
                body = System.Linq.Expressions.Expression.Constant(value, invoke.ReturnType);
            }
            else
            {
                body = System.Linq.Expressions.Expression.Default(invoke.ReturnType);
            }

            return System.Linq.Expressions.Expression.Lambda(delegateType, body, parameters).Compile();
        }
        catch
        {
            return null;
        }
    }

    public static object? CreateConfigFallback(Type configType)
    {
        var instance = CreateDefaultInstance(configType);
        if (instance is not null)
        {
            FillNullMembers(instance);
        }
        return instance;
    }

    public static object? CreateConfigFallbackWithJsonOverlay(Type configType, string path)
    {
        var fallback = CreateConfigFallback(configType);
        if (fallback is not null)
        {
            OverlaySimpleJsonValues(fallback, path);
        }
        return fallback;
    }

    public static void OverlaySimpleJsonValues(object instance, string path)
    {
        try
        {
            using var document = JsonDocument.Parse(
                File.ReadAllText(path),
                new() { CommentHandling = JsonCommentHandling.Skip, AllowTrailingCommas = true });
            if (document.RootElement.ValueKind != JsonValueKind.Object)
            {
                return;
            }

            foreach (var property in instance.GetType().GetProperties(BindingFlags.Instance | BindingFlags.Public).Where(property =>
                         property.CanWrite
                         && property.GetIndexParameters().Length == 0
                         && !ProbeSerializedMember.IsIgnored(property)))
            {
                try
                {
                    if (TryGetJsonProperty(document.RootElement, property, out var value)
                        && TryConvertJsonValue(value, property.PropertyType, out var converted))
                    {
                        property.SetValue(instance, converted);
                    }
                }
                catch
                {
                    // One incompatible member must not prevent other simple values from being restored.
                }
            }

            foreach (var field in instance.GetType().GetFields(BindingFlags.Instance | BindingFlags.Public).Where(field =>
                         !field.IsInitOnly
                         && !field.IsLiteral
                         && !ProbeSerializedMember.IsIgnored(field)))
            {
                try
                {
                    if (TryGetJsonProperty(document.RootElement, field, out var value)
                        && TryConvertJsonValue(value, field.FieldType, out var converted))
                    {
                        field.SetValue(instance, converted);
                    }
                }
                catch
                {
                    // Keep applying other public fields when one value is incompatible.
                }
            }
        }
        catch
        {
            // Best-effort fallback for config types with SMAPI-specific members.
        }
    }

    private static bool TryGetJsonProperty(JsonElement root, MemberInfo member, out JsonElement value)
    {
        var serializedName = ProbeSerializedMember.GetName(member);
        if (TryGetJsonProperty(root, serializedName, out value))
        {
            return true;
        }
        if (!serializedName.Equals(member.Name, StringComparison.OrdinalIgnoreCase)
            && TryGetJsonProperty(root, member.Name, out value))
        {
            return true;
        }

        value = default;
        return false;
    }

    private static bool TryGetJsonProperty(JsonElement root, string name, out JsonElement value)
    {
        foreach (var property in root.EnumerateObject())
        {
            if (property.Name.Equals(name, StringComparison.OrdinalIgnoreCase))
            {
                value = property.Value;
                return true;
            }
        }

        value = default;
        return false;
    }

    public static void FillNullMembers(object instance)
    {
        var type = instance.GetType();

        foreach (var property in type.GetProperties(BindingFlags.Instance | BindingFlags.Public).Where(property =>
                     property.CanRead
                     && property.CanWrite
                     && property.GetIndexParameters().Length == 0))
        {
            if (property.GetValue(instance) is null && CreateFallbackValue(property.PropertyType) is { } value)
            {
                property.SetValue(instance, value);
            }
        }

        foreach (var field in type.GetFields(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic))
        {
            if (field.GetValue(instance) is null && CreateFallbackValue(field.FieldType) is { } value)
            {
                field.SetValue(instance, value);
            }
        }
    }

    private static bool TryConvertJsonValue(JsonElement value, Type targetType, out object? converted)
    {
        converted = null;
        var effectiveType = Nullable.GetUnderlyingType(targetType) ?? targetType;
        if (effectiveType == typeof(string) && value.ValueKind == JsonValueKind.String)
        {
            converted = value.GetString();
            return true;
        }
        if (effectiveType == typeof(bool) && (value.ValueKind == JsonValueKind.True || value.ValueKind == JsonValueKind.False))
        {
            converted = value.GetBoolean();
            return true;
        }
        if ((effectiveType == typeof(byte)
                || effectiveType == typeof(short)
                || effectiveType == typeof(int)
                || effectiveType == typeof(long)
                || effectiveType == typeof(float)
                || effectiveType == typeof(double)
                || effectiveType == typeof(decimal))
            && value.ValueKind == JsonValueKind.Number)
        {
            converted = JsonSerializer.Deserialize(value.GetRawText(), effectiveType, ProbeJson.LenientOptions());
            return true;
        }
        if (effectiveType.IsEnum && value.ValueKind == JsonValueKind.String)
        {
            converted = Enum.Parse(effectiveType, value.GetString() ?? "", ignoreCase: true);
            return true;
        }
        if (effectiveType == typeof(string[]) && value.ValueKind == JsonValueKind.Array)
        {
            converted = value.EnumerateArray().Where(item => item.ValueKind == JsonValueKind.String).Select(item => item.GetString() ?? "").ToArray();
            return true;
        }
        return false;
    }

    private static object? CreateFallbackValue(Type type)
    {
        if (type == typeof(string))
        {
            return "";
        }

        if (type.IsArray)
        {
            return Array.CreateInstance(type.GetElementType() ?? typeof(object), 0);
        }

        var defaultConstructor = type.GetConstructor(Type.EmptyTypes);
        if (defaultConstructor is not null)
        {
            return defaultConstructor.Invoke([]);
        }

        var oneParameterConstructor = type.GetConstructors(BindingFlags.Instance | BindingFlags.Public)
            .OrderBy(constructor => constructor.GetParameters().Length)
            .FirstOrDefault(constructor => constructor.GetParameters().Length == 1);
        if (oneParameterConstructor is not null)
        {
            var parameterType = oneParameterConstructor.GetParameters()[0].ParameterType;
            return oneParameterConstructor.Invoke([RuntimeDefaultFactory.Create(parameterType)]);
        }

        return null;
    }
}
