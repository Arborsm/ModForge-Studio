internal static class ExternalApiProfiles
{
    public static bool Supports(string uniqueId)
    {
        return uniqueId.Equals("Pathoschild.ContentPatcher", StringComparison.OrdinalIgnoreCase);
    }

    public static object? TryCreate(string uniqueId, Type apiType, RuntimeProxyContext context)
    {
        if (Supports(uniqueId))
        {
            return RuntimeProxy.Create(apiType, new(
                "ContentPatcherApi",
                context.State,
                context.SmapiAssembly,
                null,
                null,
                null));
        }

        return null;
    }

    public static object? InvokeContentPatcherApi(MethodInfo method, object?[] args, RuntimeProxyContext context)
    {
        if (method.Name.StartsWith("Register", StringComparison.OrdinalIgnoreCase)
            || method.Name.Contains("Token", StringComparison.OrdinalIgnoreCase)
            || method.Name.Contains("Condition", StringComparison.OrdinalIgnoreCase)
            || method.Name.Contains("Asset", StringComparison.OrdinalIgnoreCase))
        {
            return CreateContentPatcherDefault(method.ReturnType, context);
        }

        if (method.Name.Equals("InvalidateCache", StringComparison.OrdinalIgnoreCase))
        {
            return CreateContentPatcherDefault(method.ReturnType, context);
        }

        if (method.Name.Equals("ParseTokenString", StringComparison.OrdinalIgnoreCase)
            || method.Name.Equals("ParseTokenStrings", StringComparison.OrdinalIgnoreCase))
        {
            return CreateContentPatcherDefault(method.ReturnType, context);
        }

        if (method.Name.Equals("IsConditionsApiReady", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return CreateContentPatcherDefault(method.ReturnType, context);
    }

    private static object? CreateContentPatcherDefault(Type returnType, RuntimeProxyContext context)
    {
        if (returnType == typeof(bool))
        {
            return true;
        }

        if (RuntimeDefaultFactory.IsEnumerableType(returnType))
        {
            return RuntimeDefaultFactory.CreateEmptyEnumerable(returnType);
        }

        return RuntimeDefaultFactory.Create(returnType, context, "ContentPatcherApi");
    }
}
