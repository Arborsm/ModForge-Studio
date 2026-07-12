internal static class ProbeSerializedMember
{
    private const string NewtonsoftJsonProperty = "Newtonsoft.Json.JsonPropertyAttribute";
    private const string SystemTextJsonPropertyName = "System.Text.Json.Serialization.JsonPropertyNameAttribute";
    private const string NewtonsoftJsonIgnore = "Newtonsoft.Json.JsonIgnoreAttribute";
    private const string SystemTextJsonIgnore = "System.Text.Json.Serialization.JsonIgnoreAttribute";

    public static string GetName(MemberInfo member)
    {
        try
        {
            foreach (var attribute in member.CustomAttributes)
            {
                if (attribute.AttributeType.FullName is not NewtonsoftJsonProperty
                    and not SystemTextJsonPropertyName)
                {
                    continue;
                }

                var namedValue = attribute.NamedArguments
                    .FirstOrDefault(argument => argument.MemberName is "PropertyName" or "Name")
                    .TypedValue.Value as string;
                var constructorValue = attribute.ConstructorArguments
                    .FirstOrDefault(argument => argument.ArgumentType == typeof(string))
                    .Value as string;
                var serializedName = namedValue ?? constructorValue;
                if (!string.IsNullOrWhiteSpace(serializedName))
                {
                    return serializedName;
                }
            }
        }
        catch
        {
            // Missing optional serializer assemblies should not prevent the probe from using CLR names.
        }

        return member.Name;
    }

    public static bool HasExplicitName(MemberInfo member)
    {
        try
        {
            return member.CustomAttributes.Any(attribute =>
                attribute.AttributeType.FullName is NewtonsoftJsonProperty
                    or SystemTextJsonPropertyName);
        }
        catch
        {
            return false;
        }
    }

    public static bool IsIgnored(MemberInfo member)
    {
        try
        {
            foreach (var attribute in member.CustomAttributes)
            {
                if (attribute.AttributeType.FullName == NewtonsoftJsonIgnore)
                {
                    return true;
                }
                if (attribute.AttributeType.FullName != SystemTextJsonIgnore)
                {
                    continue;
                }

                var condition = attribute.NamedArguments
                    .FirstOrDefault(argument => argument.MemberName == "Condition")
                    .TypedValue.Value;
                return condition is null || Convert.ToInt32(condition) == 1;
            }
            return false;
        }
        catch
        {
            return false;
        }
    }
}

internal static class ProbeJson
{
    public static object? Deserialize(string json, Type modelType)
    {
        if (FindNewtonsoftAssembly(modelType) is { } newtonsoftAssembly)
        {
            return DeserializeWithNewtonsoft(json, modelType, newtonsoftAssembly);
        }

        return JsonSerializer.Deserialize(json, modelType, LenientOptions());
    }

    public static TModel? Deserialize<TModel>(string json)
    {
        return (TModel?)Deserialize(json, typeof(TModel));
    }

    public static JsonSerializerOptions LenientOptions()
    {
        var options = new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true,
            ReadCommentHandling = JsonCommentHandling.Skip,
            AllowTrailingCommas = true,
            IncludeFields = true,
        };
        options.Converters.Add(new SmapiUtilityJsonConverterFactory());
        options.Converters.Add(new JsonStringEnumConverter());
        options.Converters.Add(new XnaVector2JsonConverterFactory());
        return options;
    }

    private static Assembly? FindNewtonsoftAssembly(Type type)
    {
        if (type.Assembly.GetName().Name?.Equals("Newtonsoft.Json", StringComparison.OrdinalIgnoreCase) == true)
        {
            return type.Assembly;
        }

        var reference = type.Assembly
            .GetReferencedAssemblies()
            .FirstOrDefault(name => name.Name?.Equals("Newtonsoft.Json", StringComparison.OrdinalIgnoreCase) == true);
        if (reference is null)
        {
            return null;
        }

        var context = AssemblyLoadContext.GetLoadContext(type.Assembly) ?? AssemblyLoadContext.Default;
        var loaded = context.Assemblies.FirstOrDefault(assembly =>
            assembly.GetName().Name?.Equals("Newtonsoft.Json", StringComparison.OrdinalIgnoreCase) == true);
        if (loaded is not null)
        {
            return loaded;
        }

        return context.LoadFromAssemblyName(reference);
    }

    private static object? DeserializeWithNewtonsoft(string json, Type modelType, Assembly newtonsoftAssembly)
    {
        var jsonConvert = newtonsoftAssembly.GetType("Newtonsoft.Json.JsonConvert", throwOnError: true)!;
        var settingsType = newtonsoftAssembly.GetType("Newtonsoft.Json.JsonSerializerSettings", throwOnError: true)!;
        var settings = Activator.CreateInstance(settingsType)
            ?? throw new InvalidOperationException("Newtonsoft.Json.JsonSerializerSettings could not be created.");
        AddSmapiKeybindConverter(modelType, settingsType, settings);

        var deserialize = jsonConvert.GetMethod(
            "DeserializeObject",
            BindingFlags.Public | BindingFlags.Static,
            binder: null,
            types: [typeof(string), typeof(Type), settingsType],
            modifiers: null)
            ?? throw new MissingMethodException(jsonConvert.FullName, "DeserializeObject(string, Type, JsonSerializerSettings)");
        try
        {
            return deserialize.Invoke(null, [json, modelType, settings]);
        }
        catch (TargetInvocationException ex) when (ex.InnerException is not null)
        {
            System.Runtime.ExceptionServices.ExceptionDispatchInfo.Capture(ex.InnerException).Throw();
            throw;
        }
    }

    private static void AddSmapiKeybindConverter(Type modelType, Type settingsType, object settings)
    {
        var context = AssemblyLoadContext.GetLoadContext(modelType.Assembly) ?? AssemblyLoadContext.Default;
        var smapiAssembly = context.Assemblies.FirstOrDefault(assembly =>
            assembly.GetName().Name?.Equals("StardewModdingAPI", StringComparison.OrdinalIgnoreCase) == true);
        var converterType = smapiAssembly?.GetType("StardewModdingAPI.Framework.Serialization.KeybindConverter");
        if (converterType is null)
        {
            return;
        }

        var converter = Activator.CreateInstance(converterType, nonPublic: true);
        var converters = settingsType.GetProperty("Converters", BindingFlags.Public | BindingFlags.Instance)
            ?.GetValue(settings) as System.Collections.IList;
        if (converter is not null && converters is not null)
        {
            converters.Add(converter);
        }
    }
}

internal sealed class XnaVector2JsonConverterFactory : JsonConverterFactory
{
    public override bool CanConvert(Type typeToConvert)
    {
        return typeToConvert.FullName == "Microsoft.Xna.Framework.Vector2";
    }

    public override JsonConverter CreateConverter(Type typeToConvert, JsonSerializerOptions options)
    {
        return (JsonConverter)Activator.CreateInstance(
            typeof(XnaVector2JsonConverter<>).MakeGenericType(typeToConvert))!;
    }
}

internal sealed class XnaVector2JsonConverter<TValue> : JsonConverter<TValue>
{
    public override TValue? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        using var value = JsonDocument.ParseValue(ref reader);
        var (x, y) = value.RootElement.ValueKind switch
        {
            JsonValueKind.Array => ReadArray(value.RootElement),
            JsonValueKind.Object => ReadObject(value.RootElement),
            JsonValueKind.String => ReadString(value.RootElement.GetString()),
            _ => (0f, 0f)
        };

        var constructor = typeToConvert.GetConstructor([typeof(float), typeof(float)]);
        if (constructor is not null)
        {
            return (TValue?)constructor.Invoke([x, y]);
        }

        var instance = Activator.CreateInstance(typeToConvert);
        typeToConvert.GetProperty("X")?.SetValue(instance, x);
        typeToConvert.GetProperty("Y")?.SetValue(instance, y);
        return (TValue?)instance;
    }

    public override void Write(Utf8JsonWriter writer, TValue value, JsonSerializerOptions options)
    {
        writer.WriteStartObject();
        writer.WriteNumber("X", ReadMember(value, "X"));
        writer.WriteNumber("Y", ReadMember(value, "Y"));
        writer.WriteEndObject();
    }

    private static (float X, float Y) ReadArray(JsonElement value)
    {
        var values = value.EnumerateArray().Take(2).Select(ReadNumber).ToArray();
        return (values.ElementAtOrDefault(0), values.ElementAtOrDefault(1));
    }

    private static (float X, float Y) ReadObject(JsonElement value)
    {
        return (
            value.TryGetProperty("X", out var x) ? ReadNumber(x) : value.TryGetProperty("x", out x) ? ReadNumber(x) : 0,
            value.TryGetProperty("Y", out var y) ? ReadNumber(y) : value.TryGetProperty("y", out y) ? ReadNumber(y) : 0);
    }

    private static (float X, float Y) ReadString(string? text)
    {
        var values = (text ?? "")
            .Split([',', ' '], StringSplitOptions.RemoveEmptyEntries)
            .Take(2)
            .Select(part => float.TryParse(part, out var parsed) ? parsed : 0)
            .ToArray();
        return (values.ElementAtOrDefault(0), values.ElementAtOrDefault(1));
    }

    private static float ReadNumber(JsonElement value)
    {
        return value.ValueKind == JsonValueKind.Number && value.TryGetSingle(out var parsed) ? parsed : 0;
    }

    private static float ReadMember(object? value, string name)
    {
        if (value is null)
        {
            return 0;
        }
        var member = value.GetType().GetProperty(name)?.GetValue(value);
        return member is null ? 0 : Convert.ToSingle(member);
    }
}

internal sealed class SmapiUtilityJsonConverterFactory : JsonConverterFactory
{
    public override bool CanConvert(Type typeToConvert)
    {
        return typeToConvert.FullName is "StardewModdingAPI.SButton"
            or "StardewModdingAPI.Utilities.Keybind"
            or "StardewModdingAPI.Utilities.KeybindList";
    }

    public override JsonConverter CreateConverter(Type typeToConvert, JsonSerializerOptions options)
    {
        return (JsonConverter)Activator.CreateInstance(
            typeof(SmapiUtilityJsonConverter<>).MakeGenericType(typeToConvert))!;
    }
}

internal sealed class SmapiUtilityJsonConverter<TValue> : JsonConverter<TValue>
{
    public override TValue? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        using var value = JsonDocument.ParseValue(ref reader);
        return (TValue?)CreateValue(typeToConvert, value.RootElement);
    }

    public override void Write(Utf8JsonWriter writer, TValue value, JsonSerializerOptions options)
    {
        writer.WriteStringValue(value?.ToString() ?? "");
    }

    private static object? CreateValue(Type type, JsonElement value)
    {
        return type.FullName switch
        {
            "StardewModdingAPI.SButton" => CreateButton(type, FirstText(value)),
            "StardewModdingAPI.Utilities.Keybind" => CreateKeybind(type, value),
            "StardewModdingAPI.Utilities.KeybindList" => CreateKeybindList(type, value),
            _ => null,
        };
    }

    private static object? CreateKeybindList(Type type, JsonElement value)
    {
        var text = value.ValueKind == JsonValueKind.String ? value.GetString() ?? "" : null;
        if (!IsNone(text) && text is not null && InvokeParse(type, text) is { } parsed)
        {
            return parsed;
        }

        var keybindType = type.Assembly.GetType("StardewModdingAPI.Utilities.Keybind");
        var keybinds = keybindType is null
            ? []
            : ReadKeybindElements(value)
                .Select(element => CreateKeybind(keybindType, element))
                .Where(item => item is not null)
                .ToList();
        if (keybindType is not null
            && type.GetConstructor([keybindType.MakeArrayType()]) is { } arrayConstructor)
        {
            var array = Array.CreateInstance(keybindType, keybinds.Count);
            for (var index = 0; index < keybinds.Count; index++)
            {
                array.SetValue(keybinds[index], index);
            }
            return arrayConstructor.Invoke([array]);
        }

        return type.GetConstructor(Type.EmptyTypes)?.Invoke([])
            ?? CreateSingleButtonValue(type, "None");
    }

    private static object? CreateKeybind(Type type, JsonElement value)
    {
        var text = value.ValueKind == JsonValueKind.String
            ? value.GetString() ?? ""
            : string.Join(" + ", ReadTexts(value));
        if (!string.IsNullOrWhiteSpace(text)
            && TryInvokeTryParse(type, text, out var parsed))
        {
            return parsed;
        }

        var buttonType = type.Assembly.GetType("StardewModdingAPI.SButton");
        if (buttonType is not null)
        {
            var buttonTexts = IsNone(text)
                ? []
                : text.Split('+', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();
            var buttons = buttonTexts
                .Select(part => CreateButton(buttonType, part))
                .Where(button => button is not null)
                .ToList();
            if (type.GetConstructor([buttonType.MakeArrayType()]) is { } arrayConstructor)
            {
                var array = Array.CreateInstance(buttonType, buttons.Count);
                for (var index = 0; index < buttons.Count; index++)
                {
                    array.SetValue(buttons[index], index);
                }
                return arrayConstructor.Invoke([array]);
            }

            if (type.GetConstructor([buttonType]) is { } buttonConstructor)
            {
                return buttonConstructor.Invoke([buttons.FirstOrDefault() ?? CreateButton(buttonType, "None")]);
            }
        }

        return type.GetConstructor(Type.EmptyTypes)?.Invoke([]);
    }

    private static object? CreateSingleButtonValue(Type type, string text)
    {
        var buttonType = type.Assembly.GetType("StardewModdingAPI.SButton");
        var constructor = buttonType is null ? null : type.GetConstructor([buttonType]);
        return constructor is null ? null : constructor.Invoke([CreateButton(buttonType!, text)]);
    }

    private static object? CreateButton(Type type, string? text)
    {
        var normalized = string.IsNullOrWhiteSpace(text)
            ? "None"
            : text.Trim().Replace("SButton.", "", StringComparison.OrdinalIgnoreCase);
        try
        {
            return Enum.Parse(type, normalized, ignoreCase: true);
        }
        catch
        {
            return Enum.ToObject(type, 0);
        }
    }

    private static object? InvokeParse(Type type, string text)
    {
        var parse = type.GetMethod(
            "Parse",
            BindingFlags.Public | BindingFlags.Static,
            binder: null,
            types: [typeof(string)],
            modifiers: null);
        try
        {
            return parse?.Invoke(null, [text]);
        }
        catch
        {
            return null;
        }
    }

    private static bool TryInvokeTryParse(Type type, string text, out object? parsed)
    {
        parsed = null;
        var method = type.GetMethods(BindingFlags.Public | BindingFlags.Static)
            .FirstOrDefault(candidate => candidate.Name == "TryParse"
                && candidate.ReturnType == typeof(bool)
                && candidate.GetParameters() is { Length: >= 2 } parameters
                && parameters[0].ParameterType == typeof(string)
                && parameters[1].ParameterType.IsByRef);
        if (method is null)
        {
            return false;
        }

        var args = method.GetParameters()
            .Select((parameter, index) => index == 0
                ? (object?)text
                : parameter.HasDefaultValue ? parameter.DefaultValue : null)
            .ToArray();
        try
        {
            var success = method.Invoke(null, args) is true;
            parsed = success ? args[1] : null;
            return success && parsed is not null;
        }
        catch
        {
            return false;
        }
    }

    private static IEnumerable<JsonElement> ReadKeybindElements(JsonElement value)
    {
        if (value.ValueKind == JsonValueKind.Array)
        {
            return value.EnumerateArray().ToList();
        }

        var text = value.ValueKind == JsonValueKind.String ? value.GetString() ?? "" : "";
        if (IsNone(text))
        {
            return [];
        }

        using var document = JsonDocument.Parse(JsonSerializer.Serialize(
            text.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)));
        return document.RootElement.EnumerateArray().Select(item => item.Clone()).ToList();
    }

    private static List<string> ReadTexts(JsonElement value)
    {
        if (value.ValueKind == JsonValueKind.String)
        {
            return [value.GetString() ?? ""];
        }
        if (value.ValueKind != JsonValueKind.Array)
        {
            return [];
        }
        return value.EnumerateArray()
            .Where(item => item.ValueKind == JsonValueKind.String)
            .Select(item => item.GetString() ?? "")
            .ToList();
    }

    private static string? FirstText(JsonElement value)
    {
        return ReadTexts(value).FirstOrDefault();
    }

    private static bool IsNone(string? text)
    {
        return string.IsNullOrWhiteSpace(text)
            || text.Equals("None", StringComparison.OrdinalIgnoreCase)
            || text.Equals("SButton.None", StringComparison.OrdinalIgnoreCase);
    }
}
