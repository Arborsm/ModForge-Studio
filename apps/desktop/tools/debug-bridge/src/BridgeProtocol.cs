using System.Text.Json;
using System.Text.Json.Serialization;

namespace ModForge.DebugBridge;

/// <summary>One JSON-line request received from ModForge Studio.</summary>
public sealed class BridgeRequest
{
    [JsonPropertyName("id")]
    public long Id { get; set; }

    [JsonPropertyName("command")]
    public string Command { get; set; } = "";

    [JsonPropertyName("args")]
    public JsonElement? Args { get; set; }

    public string? GetString(string name)
    {
        if (this.Args is not JsonElement args || args.ValueKind != JsonValueKind.Object)
            return null;
        if (!args.TryGetProperty(name, out JsonElement value))
            return null;
        return value.ValueKind switch
        {
            JsonValueKind.String => value.GetString(),
            JsonValueKind.Number => value.GetRawText(),
            JsonValueKind.True => "true",
            JsonValueKind.False => "false",
            _ => null
        };
    }

    public int? GetInt(string name)
    {
        if (this.Args is not JsonElement args || args.ValueKind != JsonValueKind.Object)
            return null;
        if (!args.TryGetProperty(name, out JsonElement value))
            return null;
        if (value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out int number))
            return number;
        if (value.ValueKind == JsonValueKind.String && int.TryParse(value.GetString(), out int parsed))
            return parsed;
        return null;
    }

    public bool GetBool(string name, bool fallback)
    {
        if (this.Args is not JsonElement args || args.ValueKind != JsonValueKind.Object)
            return fallback;
        if (!args.TryGetProperty(name, out JsonElement value))
            return fallback;
        return value.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            _ => fallback
        };
    }
}

/// <summary>One JSON-line response sent back to ModForge Studio.</summary>
public sealed class BridgeResponse
{
    [JsonPropertyName("id")]
    public long Id { get; set; }

    [JsonPropertyName("ok")]
    public bool Ok { get; set; }

    [JsonPropertyName("result")]
    public object? Result { get; set; }

    [JsonPropertyName("error")]
    public string? Error { get; set; }

    public static BridgeResponse Success(long id, object? result) => new() { Id = id, Ok = true, Result = result };

    public static BridgeResponse Failure(long id, string error) => new() { Id = id, Ok = false, Error = error };
}

/// <summary>Serialization settings shared by the bridge server.</summary>
public static class BridgeJson
{
    public static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };
}
