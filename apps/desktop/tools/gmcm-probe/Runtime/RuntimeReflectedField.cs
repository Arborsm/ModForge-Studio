internal static class RuntimeReflectedFieldFactory
{
    private static readonly AssemblyBuilder AssemblyBuilder = AssemblyBuilder.DefineDynamicAssembly(
        new AssemblyName("ModForgeProbeReflectedFields"),
        AssemblyBuilderAccess.Run);
    private static readonly ModuleBuilder ModuleBuilder = AssemblyBuilder.DefineDynamicModule("ModForgeProbeReflectedFields");
    private static readonly Dictionary<Type, Type> Implementations = new();

    public static object? Create(Type interfaceType)
    {
        if (!interfaceType.IsInterface)
        {
            return null;
        }

        if (!Implementations.TryGetValue(interfaceType, out var implementationType))
        {
            implementationType = BuildImplementation(interfaceType);
            Implementations[interfaceType] = implementationType;
        }

        return Activator.CreateInstance(implementationType);
    }

    private static Type BuildImplementation(Type interfaceType)
    {
        var typeBuilder = ModuleBuilder.DefineType(
            $"ReflectedField_{Implementations.Count}",
            TypeAttributes.Public | TypeAttributes.Sealed | TypeAttributes.Class);
        var interfaces = interfaceType.GetInterfaces().Append(interfaceType).ToList();
        foreach (var implementedInterface in interfaces)
        {
            typeBuilder.AddInterfaceImplementation(implementedInterface);
        }

        foreach (var method in interfaces.SelectMany(type => type.GetMethods()).DistinctBy(MethodKey))
        {
            ImplementMethod(typeBuilder, method);
        }

        return typeBuilder.CreateType()
            ?? throw new InvalidOperationException($"Failed to build reflected field proxy for {interfaceType.FullName}.");
    }

    private static string MethodKey(MethodInfo method)
    {
        return $"{method.Module.ModuleVersionId}:{method.MetadataToken}";
    }

    private static void ImplementMethod(TypeBuilder typeBuilder, MethodInfo interfaceMethod)
    {
        var parameters = interfaceMethod.GetParameters().Select(parameter => parameter.ParameterType).ToArray();
        var methodBuilder = typeBuilder.DefineMethod(
            interfaceMethod.Name,
            MethodAttributes.Public | MethodAttributes.Virtual | MethodAttributes.Final | MethodAttributes.HideBySig | MethodAttributes.NewSlot,
            interfaceMethod.ReturnType,
            parameters);
        var il = methodBuilder.GetILGenerator();
        EmitDefaultReturn(il, interfaceMethod.ReturnType);
        typeBuilder.DefineMethodOverride(methodBuilder, interfaceMethod);
    }

    private static void EmitDefaultReturn(ILGenerator il, Type returnType)
    {
        if (returnType == typeof(void))
        {
            il.Emit(OpCodes.Ret);
            return;
        }

        if (returnType.IsValueType)
        {
            var local = il.DeclareLocal(returnType);
            il.Emit(OpCodes.Ldloca_S, local);
            il.Emit(OpCodes.Initobj, returnType);
            il.Emit(OpCodes.Ldloc_0);
            il.Emit(OpCodes.Ret);
            return;
        }

        il.Emit(OpCodes.Ldnull);
        il.Emit(OpCodes.Ret);
    }
}
