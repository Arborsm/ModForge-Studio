internal static class RuntimeDefaultFactory
{
    public static object? Create(Type type, RuntimeProxyContext? context = null, string? role = null)
    {
        if (type == typeof(void))
        {
            return null;
        }

        if (type.IsValueType)
        {
            return Activator.CreateInstance(type);
        }

        if (type == typeof(string))
        {
            return null;
        }

        if (type.IsArray)
        {
            return Array.CreateInstance(type.GetElementType() ?? typeof(object), 0);
        }

        if (IsDictionaryType(type))
        {
            return RuntimeValueFactory.CreateDefaultInstance(type);
        }

        if (IsEnumerableType(type))
        {
            return CreateEmptyEnumerable(type);
        }

        if (typeof(Delegate).IsAssignableFrom(type))
        {
            return CreateNoOpDelegate(type);
        }

        if (type.IsInterface && context is not null)
        {
            return TryCreateInterfaceProxy(type, context, role);
        }

        return null;
    }

    private static object? TryCreateInterfaceProxy(Type interfaceType, RuntimeProxyContext context, string? role)
    {
        try
        {
            foreach (var method in interfaceType.GetMethods())
            {
                _ = method.ReturnType;
                foreach (var parameter in method.GetParameters())
                {
                    _ = parameter.ParameterType;
                }
            }

            return RuntimeProxy.Create(interfaceType, new(
                role ?? interfaceType.Name,
                context.State,
                context.SmapiAssembly,
                null,
                null,
                null));
        }
        catch (Exception ex)
        {
            context.State?.NoteAssemblyLoad($"Could not create no-op proxy for {interfaceType.FullName}: {ex.GetBaseException().Message}");
            return null;
        }
    }

    public static bool IsEnumerableType(Type type)
    {
        return type != typeof(string)
            && !IsDictionaryType(type)
            && (type.IsArray
                || type.GetInterfaces().Any(item => item.IsGenericType && item.GetGenericTypeDefinition() == typeof(IEnumerable<>))
                || type.IsGenericType && type.GetGenericTypeDefinition() == typeof(IEnumerable<>));
    }

    private static bool IsDictionaryType(Type type)
    {
        return type.GetInterfaces().Any(item => item.IsGenericType && item.GetGenericTypeDefinition() == typeof(IDictionary<,>))
            || type.IsGenericType && type.GetGenericTypeDefinition() == typeof(IDictionary<,>);
    }

    public static object? CreateEmptyEnumerable(Type enumerableType)
    {
        return CreateEnumerable(enumerableType, []);
    }

    public static object? CreateSingleItemEnumerable(Type enumerableType, object? item)
    {
        return CreateEnumerable(enumerableType, [item]);
    }

    public static Type? GetEnumerableItemType(Type type)
    {
        if (type.IsArray)
        {
            return type.GetElementType();
        }

        if (type.IsGenericType && type.GetGenericTypeDefinition() == typeof(IEnumerable<>))
        {
            return type.GetGenericArguments()[0];
        }

        return type.GetInterfaces()
            .FirstOrDefault(item => item.IsGenericType && item.GetGenericTypeDefinition() == typeof(IEnumerable<>))
            ?.GetGenericArguments()[0];
    }

    private static object? CreateEnumerable(Type enumerableType, object?[] items)
    {
        var itemType = GetEnumerableItemType(enumerableType) ?? typeof(object);
        var array = Array.CreateInstance(itemType, items.Length);
        for (var index = 0; index < items.Length; index++)
        {
            if (items[index] is not null)
            {
                array.SetValue(items[index], index);
            }
        }
        return array;
    }

    private static object? CreateNoOpDelegate(Type delegateType)
    {
        var invoke = delegateType.GetMethod("Invoke");
        if (invoke is null)
        {
            return null;
        }

        var parameters = invoke.GetParameters()
            .Select(parameter => System.Linq.Expressions.Expression.Parameter(parameter.ParameterType, parameter.Name))
            .ToArray();
        var body = invoke.ReturnType == typeof(void)
            ? System.Linq.Expressions.Expression.Empty()
            : System.Linq.Expressions.Expression.Default(invoke.ReturnType);
        return System.Linq.Expressions.Expression.Lambda(delegateType, body, parameters).Compile();
    }
}
