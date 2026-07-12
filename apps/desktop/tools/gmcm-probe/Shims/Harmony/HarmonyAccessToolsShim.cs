using System.Collections;
using System.Linq.Expressions;
using System.Reflection;
using System.Reflection.Emit;

namespace HarmonyLib;

public static class AccessTools
{
    public delegate ref F FieldRef<in T, F>(T instance);

    public delegate ref F StructFieldRef<T, F>(ref T instance) where T : struct;

    public delegate ref F FieldRef<F>();

    public static IEnumerable<Type> AllTypes()
    {
        return AppDomain.CurrentDomain.GetAssemblies().SelectMany(GetLoadableTypes);
    }

    public static Type? TypeByName(string name)
    {
        return Type.GetType(name);
    }

    public static MethodInfo? Method(Type type, string name, Type[]? parameters = null, Type[]? generics = null)
    {
        if (type is null)
        {
            return null;
        }

        var flags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static;
        return parameters is null ? type.GetMethod(name, flags) : type.GetMethod(name, flags, parameters);
    }

    public static MethodInfo? Method(string typeColonMethodName)
    {
        var parts = typeColonMethodName.Split(':', 2);
        return parts.Length == 2 && TypeByName(parts[0]) is { } type ? Method(type, parts[1]) : null;
    }

    public static MethodInfo? Method(string typeColonMethodName, Type[]? parameters, Type[]? generics = null)
    {
        var parts = typeColonMethodName.Split(':', 2);
        return parts.Length == 2 && TypeByName(parts[0]) is { } type ? Method(type, parts[1], parameters, generics) : null;
    }

    public static ConstructorInfo? Constructor(Type type, Type[]? parameters = null)
    {
        if (type is null)
        {
            return null;
        }

        var flags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance;
        return parameters is null ? type.GetConstructors(flags).FirstOrDefault() : type.GetConstructor(flags, parameters);
    }

    public static ConstructorInfo? Constructor(Type type, Type[]? parameters, bool searchForStatic)
    {
        if (type is null)
        {
            return null;
        }

        var flags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance;
        if (searchForStatic)
        {
            flags |= BindingFlags.Static;
        }
        return parameters is null ? type.GetConstructors(flags).FirstOrDefault() : type.GetConstructor(flags, parameters);
    }

    public static ConstructorInfo? DeclaredConstructor(Type type, Type[]? parameters = null, bool searchForStatic = false)
    {
        if (type is null)
        {
            return null;
        }

        var flags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.DeclaredOnly;
        if (searchForStatic)
        {
            flags |= BindingFlags.Static;
        }
        return parameters is null ? type.GetConstructors(flags).FirstOrDefault() : type.GetConstructor(flags, parameters);
    }

    public static MethodInfo? DeclaredMethod(Type type, string name, Type[]? parameters = null, Type[]? generics = null)
    {
        if (type is null)
        {
            return null;
        }

        var flags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly;
        return parameters is null ? type.GetMethod(name, flags) : type.GetMethod(name, flags, parameters);
    }

    public static List<MethodInfo> GetDeclaredMethods(Type type)
    {
        if (type is null)
        {
            return [];
        }

        return type.GetMethods(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly).ToList();
    }

    public static bool IsDeclaredMember<T>(T member) where T : MemberInfo
    {
        return member.DeclaringType is not null;
    }

    public static FieldInfo? Field(Type type, string name)
    {
        if (type is null)
        {
            return null;
        }

        return type.GetField(name, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static);
    }

    public static PropertyInfo? Property(Type type, string name)
    {
        if (type is null)
        {
            return null;
        }

        return type.GetProperty(name, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static);
    }

    public static MethodInfo? PropertyGetter(Type type, string name)
    {
        return Property(type, name)?.GetGetMethod(true);
    }

    public static MethodInfo? DeclaredPropertyGetter(Type type, string name)
    {
        return type.GetProperty(name, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly)
            ?.GetGetMethod(true);
    }

    public static MethodInfo? PropertySetter(Type type, string name)
    {
        return Property(type, name)?.GetSetMethod(true);
    }

    public static MethodInfo? DeclaredPropertySetter(Type type, string name)
    {
        return type.GetProperty(name, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly)
            ?.GetSetMethod(true);
    }

    public static FieldRef<T, F> FieldRefAccess<T, F>(string fieldName)
    {
        return static instance => ref ThrowFieldRef<F>();
    }

    public static ref F FieldRefAccess<T, F>(T instance, string fieldName)
    {
        return ref ThrowFieldRef<F>();
    }

    public static FieldRef<object, F> FieldRefAccess<F>(Type type, string fieldName)
    {
        return static instance => ref ThrowFieldRef<F>();
    }

    public static FieldRef<object, F> FieldRefAccess<F>(string fieldName)
    {
        return static instance => ref ThrowFieldRef<F>();
    }

    public static FieldRef<T, F> FieldRefAccess<T, F>(FieldInfo fieldInfo)
    {
        return static instance => ref ThrowFieldRef<F>();
    }

    public static ref F FieldRefAccess<T, F>(T instance, FieldInfo fieldInfo)
    {
        return ref ThrowFieldRef<F>();
    }

    public static StructFieldRef<T, F> StructFieldRefAccess<T, F>(string fieldName) where T : struct
    {
        return static (ref T instance) => ref ThrowFieldRef<F>();
    }

    public static ref F StructFieldRefAccess<T, F>(ref T instance, string fieldName) where T : struct
    {
        return ref ThrowFieldRef<F>();
    }

    public static StructFieldRef<T, F> StructFieldRefAccess<T, F>(FieldInfo fieldInfo) where T : struct
    {
        return static (ref T instance) => ref ThrowFieldRef<F>();
    }

    public static ref F StructFieldRefAccess<T, F>(ref T instance, FieldInfo fieldInfo) where T : struct
    {
        return ref ThrowFieldRef<F>();
    }

    public static ref F StaticFieldRefAccess<T, F>(string fieldName)
    {
        return ref ThrowFieldRef<F>();
    }

    public static ref F StaticFieldRefAccess<F>(Type type, string fieldName)
    {
        return ref ThrowFieldRef<F>();
    }

    public static ref F StaticFieldRefAccess<F>(string fieldName)
    {
        return ref ThrowFieldRef<F>();
    }

    public static ref F StaticFieldRefAccess<T, F>(FieldInfo fieldInfo)
    {
        return ref ThrowFieldRef<F>();
    }

    public static FieldRef<F> StaticFieldRefAccess<F>(FieldInfo fieldInfo)
    {
        return static () => ref ThrowFieldRef<F>();
    }

    public static ref F ThrowFieldRef<F>()
    {
        throw new NotSupportedException("The GMCM probe Harmony shim does not expose field references.");
    }

    private static IEnumerable<Type> GetLoadableTypes(Assembly assembly)
    {
        try
        {
            return assembly.GetTypes();
        }
        catch (ReflectionTypeLoadException ex)
        {
            return ex.Types.OfType<Type>();
        }
    }
}
