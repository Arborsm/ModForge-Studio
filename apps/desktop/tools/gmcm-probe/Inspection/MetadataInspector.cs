using System.Collections.Immutable;
using System.Reflection.Metadata;
using System.Reflection.Metadata.Ecma335;
using System.Reflection.PortableExecutable;

internal static class MetadataInspector
{
    private const string GmcmName = "GenericModConfigMenu";
    private const string GmcmUniqueId = "spacechase0.GenericModConfigMenu";
    private const int MaxBundledAssemblies = 128;
    private static readonly IReadOnlyDictionary<ushort, OpCode> IlOpCodes = BuildIlOpCodeMap();

    public static void Inspect(string dll, ProbeState state, bool collectFields)
    {
        var modRoot = ProbePathSafety.ResolveExistingRealPath(state.ModPath);
        if (!ProbePathSafety.TryResolveFileWithinRoot(modRoot, dll, out var entryDll, out var pathError))
        {
            throw new InvalidOperationException(pathError ?? $"Entry DLL resolves outside the mod root: {dll}");
        }

        var localAssemblies = ProbeLocalAssemblyIndex.Build(modRoot);
        HashSet<string> visited = new(ProbePathSafety.PathComparer);
        InspectAssembly(
            entryDll,
            state,
            collectFields,
            localAssemblies,
            visited,
            isEntryAssembly: true);
        CollectReachableRegistrationCandidates(
            entryDll,
            modRoot,
            localAssemblies,
            visited,
            state);
    }

    private static void InspectAssembly(
        string dll,
        ProbeState state,
        bool collectFields,
        ProbeLocalAssemblyIndex localAssemblies,
        HashSet<string> visited,
        bool isEntryAssembly)
    {
        if (visited.Count >= MaxBundledAssemblies || !visited.Add(dll))
        {
            return;
        }

        using var stream = File.OpenRead(dll);
        using var peReader = new PEReader(stream, PEStreamOptions.PrefetchEntireImage);
        if (!peReader.HasMetadata)
        {
            throw new BadImageFormatException($"{Path.GetFileName(dll)} does not contain .NET metadata.");
        }

        var reader = peReader.GetMetadataReader();
        var sourceAssembly = Path.GetFileName(dll);
        List<AssemblyName> references = [];
        foreach (var handle in reader.AssemblyReferences)
        {
            var reference = reader.GetAssemblyReference(handle);
            var name = reader.GetString(reference.Name);
            references.Add(CreateAssemblyName(reader, reference, name));
            state.NoteAssemblyReference(new ProbeAssemblyReference(
                sourceAssembly,
                name,
                reference.Version.ToString(),
                reference.Culture.IsNil ? null : reader.GetString(reference.Culture),
                FormatPublicKeyToken(reader, reference.PublicKeyOrToken)));
            if (isEntryAssembly && name.Equals("StardewModdingAPI", StringComparison.OrdinalIgnoreCase))
            {
                state.RequestedSmapiVersion ??= reference.Version.ToString();
            }
            state.GmcmDetected |= ContainsGmcm(name);
        }

        var provider = new MetadataTypeProvider();
        HashSet<TypeDefinitionHandle> configTypes;
        try
        {
            configTypes = collectFields
                ? FindConfigTypes(peReader, reader, provider)
                : [];
        }
        catch (Exception ex)
        {
            throw new BadImageFormatException($"Static config evidence could not be decoded: {ex.Message}");
        }
        foreach (var handle in reader.TypeReferences)
        {
            state.GmcmDetected |= ContainsGmcm(GetTypeFullName(reader, handle));
        }

        foreach (var handle in reader.TypeDefinitions)
        {
            var type = reader.GetTypeDefinition(handle);
            var typeName = reader.GetString(type.Name);
            state.GmcmDetected |= ContainsGmcm(typeName)
                || ContainsGmcm(reader.GetString(type.Namespace));

            if (!collectFields || !configTypes.Contains(handle))
            {
                continue;
            }

            CollectFields(reader, provider, type, state);
            CollectProperties(reader, provider, type, state);
        }
        if (collectFields && configTypes.Count == 0)
        {
            state.NoteAssemblyLoad(
                $"{sourceAssembly} static config fallback skipped because no config type was proven from ReadConfig<T> or a SMAPI mod entry config member.");
        }

        foreach (var reference in references)
        {
            if (!localAssemblies.TryResolve(
                reference,
                Path.GetDirectoryName(dll),
                out var helperDll,
                out var resolutionDetail))
            {
                if (!string.IsNullOrWhiteSpace(resolutionDetail))
                {
                    state.NoteAssemblyLoad(resolutionDetail);
                }
                continue;
            }
            if (visited.Contains(helperDll))
            {
                continue;
            }

            try
            {
                InspectAssembly(
                    helperDll,
                    state,
                    collectFields: false,
                    localAssemblies,
                    visited,
                    isEntryAssembly: false);
            }
            catch (Exception ex)
            {
                state.NoteAssemblyLoad(
                    $"Skipped bundled metadata dependency {helperDll}: {ex.GetBaseException().Message}");
            }
        }
    }

    private static AssemblyName CreateAssemblyName(
        MetadataReader reader,
        AssemblyReference reference,
        string name)
    {
        var result = new AssemblyName
        {
            Name = name,
            Version = reference.Version,
            CultureName = reference.Culture.IsNil ? null : reader.GetString(reference.Culture),
        };
        if (!reference.PublicKeyOrToken.IsNil)
        {
            var key = reader.GetBlobBytes(reference.PublicKeyOrToken);
            if ((reference.Flags & AssemblyFlags.PublicKey) != 0)
            {
                result.SetPublicKey(key);
            }
            else
            {
                result.SetPublicKeyToken(key);
            }
        }
        return result;
    }

    private static HashSet<TypeDefinitionHandle> FindConfigTypes(
        PEReader peReader,
        MetadataReader reader,
        MetadataTypeProvider provider)
    {
        HashSet<TypeDefinitionHandle> result = [];
        foreach (var typeHandle in reader.TypeDefinitions)
        {
            bool isModType;
            try
            {
                isModType = IsSmapiModEntry(reader, typeHandle, provider);
            }
            catch
            {
                continue;
            }
            if (!isModType)
            {
                continue;
            }

            var type = reader.GetTypeDefinition(typeHandle);
            foreach (var fieldHandle in type.GetFields())
            {
                try
                {
                    AddNamedConfigType(
                        reader,
                        result,
                        reader.GetFieldDefinition(fieldHandle).DecodeSignature(provider, null));
                }
                catch
                {
                    // One malformed member does not invalidate other config evidence.
                }
            }
            foreach (var propertyHandle in type.GetProperties())
            {
                try
                {
                    var property = reader.GetPropertyDefinition(propertyHandle);
                    AddNamedConfigType(reader, result, property.DecodeSignature(provider, null).ReturnType);
                }
                catch
                {
                    // One malformed member does not invalidate other config evidence.
                }
            }
        }

        foreach (var methodHandle in reader.MethodDefinitions)
        {
            var method = reader.GetMethodDefinition(methodHandle);
            if (method.RelativeVirtualAddress == 0)
            {
                continue;
            }
            try
            {
                var ilReader = peReader.GetMethodBody(method.RelativeVirtualAddress).GetILReader();
                while (ilReader.RemainingBytes > 0)
                {
                    var instruction = ReadInstruction(ref ilReader);
                    if (instruction.MetadataToken is not int metadataToken)
                    {
                        continue;
                    }
                    if (instruction.OpCode != OpCodes.Call
                        && instruction.OpCode != OpCodes.Callvirt
                        && instruction.OpCode != OpCodes.Ldftn
                        && instruction.OpCode != OpCodes.Ldvirtftn)
                    {
                        continue;
                    }

                    var handle = MetadataTokens.EntityHandle(metadataToken);
                    if (handle.Kind == HandleKind.MethodSpecification)
                    {
                        var specification = reader.GetMethodSpecification((MethodSpecificationHandle)handle);
                        if (ResolveCalledMethod(reader, provider, specification.Method) is { Name: "ReadConfig" })
                        {
                            foreach (var argument in specification.DecodeSignature(provider, null))
                            {
                                AddProvenConfigType(result, argument);
                            }
                        }
                    }
                }
            }
            catch
            {
                // Malformed methods cannot prove a static config type.
            }
        }

        return result;
    }

    private static void AddProvenConfigType(HashSet<TypeDefinitionHandle> result, MetadataTypeShape shape)
    {
        if (!shape.Definition.IsNil)
        {
            result.Add(shape.Definition);
        }
    }

    private static void AddNamedConfigType(
        MetadataReader reader,
        HashSet<TypeDefinitionHandle> result,
        MetadataTypeShape shape)
    {
        if (shape.Definition.IsNil)
        {
            return;
        }
        var type = reader.GetTypeDefinition(shape.Definition);
        if (reader.GetString(type.Name).Contains("Config", StringComparison.OrdinalIgnoreCase))
        {
            result.Add(shape.Definition);
        }
    }

    private static bool IsSmapiModType(
        MetadataReader reader,
        TypeDefinitionHandle handle,
        HashSet<TypeDefinitionHandle> visited)
    {
        if (!visited.Add(handle))
        {
            return false;
        }
        var type = reader.GetTypeDefinition(handle);
        return type.BaseType.Kind switch
        {
            HandleKind.TypeReference => GetTypeFullName(reader, (TypeReferenceHandle)type.BaseType) == "StardewModdingAPI.Mod",
            HandleKind.TypeDefinition => IsSmapiModType(reader, (TypeDefinitionHandle)type.BaseType, visited),
            _ => false,
        };
    }

    private static bool IsSmapiModEntry(
        MetadataReader reader,
        TypeDefinitionHandle handle,
        MetadataTypeProvider provider)
    {
        try
        {
            if (IsSmapiModType(reader, handle, []))
            {
                return true;
            }
        }
        catch
        {
            // Fall through to the Entry(IModHelper) signature check.
        }

        var type = reader.GetTypeDefinition(handle);
        foreach (var methodHandle in type.GetMethods())
        {
            var method = reader.GetMethodDefinition(methodHandle);
            if (!reader.GetString(method.Name).Equals("Entry", StringComparison.Ordinal))
            {
                continue;
            }
            try
            {
                if (method.DecodeSignature(provider, null).ParameterTypes
                    .Any(parameter => parameter.FullName == "StardewModdingAPI.IModHelper"))
                {
                    return true;
                }
            }
            catch
            {
                // An undecodable Entry signature is not reliable config evidence.
            }
        }
        return false;
    }

    private static void CollectReachableRegistrationCandidates(
        string entryDll,
        string modRoot,
        ProbeLocalAssemblyIndex localAssemblies,
        IEnumerable<string> inspectedAssemblies,
        ProbeState state)
    {
        Dictionary<string, MetadataAssembly> assemblies = new(ProbePathSafety.PathComparer);
        try
        {
            foreach (var path in inspectedAssemblies.OrderBy(path => path, ProbePathSafety.PathComparer))
            {
                try
                {
                    assemblies[path] = new MetadataAssembly(path);
                }
                catch (Exception ex) when (ex is IOException or BadImageFormatException or UnauthorizedAccessException)
                {
                    state.NoteAssemblyLoad(
                        $"Skipped {Path.GetFileName(path)} while building the GMCM reachability graph: {ex.GetBaseException().Message}");
                }
            }

            if (!assemblies.TryGetValue(entryDll, out var entryAssembly))
            {
                return;
            }

            var reachableMethods = FindMethodsReachableFromModEntry(
                entryAssembly,
                assemblies,
                localAssemblies);
            foreach (var assembly in assemblies.Values)
            {
                var skippedUnreachable = 0;
                foreach (var handle in assembly.Reader.MethodDefinitions)
                {
                    var method = assembly.Reader.GetMethodDefinition(handle);
                    MethodSignature<MetadataTypeShape> signature;
                    try
                    {
                        signature = method.DecodeSignature(assembly.Provider, null);
                    }
                    catch (BadImageFormatException)
                    {
                        continue;
                    }

                    var signatureReferencesGmcm = ContainsGmcm(signature.ReturnType.FullName)
                        || signature.ParameterTypes.Any(parameter => ContainsGmcm(parameter.FullName));
                    var evidence = GetGmcmMethodEvidence(
                        assembly.PeReader,
                        assembly.Reader,
                        assembly.Provider,
                        method);
                    if (!signatureReferencesGmcm && !evidence.HasUniqueId && !evidence.HasRegistrationCall)
                    {
                        continue;
                    }

                    state.GmcmDetected = true;
                    var methodName = assembly.Reader.GetString(method.Name);
                    var isGameLaunchedHandler = signature.ParameterTypes.Any(parameter =>
                        parameter.FullName?.EndsWith("GameLaunchedEventArgs", StringComparison.Ordinal) == true);
                    if (!evidence.HasRegistrationCall
                        || !IsExecutableRegistrationCandidate(
                            methodName,
                            signatureReferencesGmcm,
                            isGameLaunchedHandler))
                    {
                        continue;
                    }

                    var identity = new ReachableMethod(assembly.Path, MetadataTokens.GetToken(handle));
                    if (!reachableMethods.TryGetValue(identity, out var entryTypes))
                    {
                        skippedUnreachable++;
                        continue;
                    }

                    var sourcePath = Path.GetRelativePath(modRoot, assembly.Path);
                    if (!ProbePathSafety.TryResolveRelativeFileWithinRoot(
                        modRoot,
                        sourcePath,
                        out var resolvedSource,
                        out _)
                        || !ProbePathSafety.PathComparer.Equals(resolvedSource, assembly.Path))
                    {
                        state.NoteAssemblyLoad(
                            $"Skipped reachable GMCM candidate {assembly.SourceAssembly}:{methodName} because its assembly path was not safely relative to the mod root.");
                        continue;
                    }

                    foreach (var entryType in entryTypes.OrderBy(value => value, StringComparer.Ordinal))
                    {
                        state.NoteRegistrationCandidate(new ProbeRegistrationCandidate(
                            assembly.SourceAssembly,
                            GetTypeFullName(assembly.Reader, method.GetDeclaringType()),
                            methodName,
                            MetadataTokens.GetToken(handle),
                            (method.Attributes & MethodAttributes.Static) != 0,
                            signature.ParameterTypes.Select(GetParameterTypeName).ToList(),
                            sourcePath,
                            entryType));
                    }
                }

                if (skippedUnreachable > 0)
                {
                    state.NoteAssemblyLoad(
                        $"{assembly.SourceAssembly} skipped {skippedUnreachable} GMCM registration method(s) that were not reachable from a SMAPI Entry/event call path.");
                }
            }

            CollectReachableConstructorCandidates(
                modRoot,
                assemblies,
                reachableMethods,
                state);
        }
        finally
        {
            foreach (var assembly in assemblies.Values)
            {
                assembly.Dispose();
            }
        }
    }

    private static Dictionary<ReachableMethod, HashSet<string>> FindMethodsReachableFromModEntry(
        MetadataAssembly entryAssembly,
        IReadOnlyDictionary<string, MetadataAssembly> assemblies,
        ProbeLocalAssemblyIndex localAssemblies)
    {
        Dictionary<ReachableMethod, HashSet<string>> reachable = new(new ReachableMethodComparer());
        Queue<ReachabilityWorkItem> pending = new();
        foreach (var typeHandle in entryAssembly.Reader.TypeDefinitions)
        {
            bool isModType;
            try
            {
                isModType = IsSmapiModType(entryAssembly.Reader, typeHandle, []);
            }
            catch
            {
                continue;
            }
            if (!isModType)
            {
                continue;
            }

            var entryType = GetTypeFullName(entryAssembly.Reader, typeHandle);
            var type = entryAssembly.Reader.GetTypeDefinition(typeHandle);
            foreach (var methodHandle in type.GetMethods())
            {
                var method = entryAssembly.Reader.GetMethodDefinition(methodHandle);
                try
                {
                    var signature = method.DecodeSignature(entryAssembly.Provider, null);
                    var isEntry = entryAssembly.Reader.GetString(method.Name).Equals("Entry", StringComparison.Ordinal)
                        && signature.ParameterTypes.Any(parameter =>
                            parameter.FullName == "StardewModdingAPI.IModHelper");
                    var isReflectedSubscriber = HasSubscriberAttribute(
                        entryAssembly.Reader,
                        entryAssembly.Provider,
                        method.GetCustomAttributes())
                        && signature.ParameterTypes.Any(parameter =>
                            parameter.FullName?.EndsWith("EventArgs", StringComparison.Ordinal) == true);
                    if (isEntry || isReflectedSubscriber)
                    {
                        pending.Enqueue(new(
                            new(entryAssembly.Path, MetadataTokens.GetToken(methodHandle)),
                            entryType));
                    }
                }
                catch
                {
                    // An undecodable Entry signature cannot provide reliable reachability evidence.
                }
            }
        }

        while (pending.TryDequeue(out var workItem))
        {
            if (!reachable.TryGetValue(workItem.Method, out var entryTypes))
            {
                entryTypes = new(StringComparer.Ordinal);
                reachable[workItem.Method] = entryTypes;
            }
            if (!entryTypes.Add(workItem.EntryType)
                || !assemblies.TryGetValue(workItem.Method.AssemblyPath, out var assembly)
                || !TryGetMethodDefinition(assembly.Reader, workItem.Method.MetadataToken, out var method))
            {
                continue;
            }

            if (method.RelativeVirtualAddress == 0)
            {
                continue;
            }
            try
            {
                var ilReader = assembly.PeReader.GetMethodBody(method.RelativeVirtualAddress).GetILReader();
                while (ilReader.RemainingBytes > 0)
                {
                    var instruction = ReadInstruction(ref ilReader);
                    if (instruction.MetadataToken is not int token
                        || instruction.OpCode != OpCodes.Call
                            && instruction.OpCode != OpCodes.Callvirt
                            && instruction.OpCode != OpCodes.Ldftn
                            && instruction.OpCode != OpCodes.Ldvirtftn
                            && instruction.OpCode != OpCodes.Newobj
                        || TryResolveReachableMethod(
                            assembly,
                            token,
                            assemblies,
                            localAssemblies) is not { } called)
                    {
                        continue;
                    }
                    pending.Enqueue(new(called, workItem.EntryType));
                }
            }
            catch
            {
                // Malformed or ambiguous IL stops this edge instead of widening execution.
            }
        }

        return reachable;
    }

    private static bool HasSubscriberAttribute(
        MetadataReader reader,
        MetadataTypeProvider provider,
        CustomAttributeHandleCollection attributes)
    {
        foreach (var handle in attributes)
        {
            try
            {
                var attribute = reader.GetCustomAttribute(handle);
                var attributeName = GetCustomAttributeTypeFullName(reader, provider, attribute);
                if (attributeName.EndsWith(".SubscriberAttribute", StringComparison.Ordinal)
                    || attributeName.EndsWith(".Subscriber", StringComparison.Ordinal))
                {
                    return true;
                }
            }
            catch (BadImageFormatException)
            {
                // An undecodable subscriber marker cannot establish a safe event root.
            }
        }

        return false;
    }

    private static void CollectReachableConstructorCandidates(
        string modRoot,
        IReadOnlyDictionary<string, MetadataAssembly> assemblies,
        IReadOnlyDictionary<ReachableMethod, HashSet<string>> reachableMethods,
        ProbeState state)
    {
        var registrationMethods = state.RegistrationCandidates
            .Where(candidate => !candidate.MethodName.Equals(".ctor", StringComparison.Ordinal))
            .ToList();
        foreach (var registration in registrationMethods)
        {
            if (!ProbePathSafety.TryResolveRelativeFileWithinRoot(
                modRoot,
                registration.SourcePath,
                out var assemblyPath,
                out _)
                || !assemblies.TryGetValue(assemblyPath, out var assembly)
                || !assembly.TryGetTypeDefinition(registration.DeclaringType, out var typeHandle))
            {
                continue;
            }

            foreach (var constructorHandle in assembly.Reader.GetTypeDefinition(typeHandle).GetMethods())
            {
                var constructor = assembly.Reader.GetMethodDefinition(constructorHandle);
                if (!assembly.Reader.GetString(constructor.Name).Equals(".ctor", StringComparison.Ordinal))
                {
                    continue;
                }

                var identity = new ReachableMethod(
                    assembly.Path,
                    MetadataTokens.GetToken(constructorHandle));
                if (!reachableMethods.TryGetValue(identity, out var entryTypes)
                    || !entryTypes.Contains(registration.EntryType))
                {
                    continue;
                }

                MethodSignature<MetadataTypeShape> signature;
                try
                {
                    signature = constructor.DecodeSignature(assembly.Provider, null);
                }
                catch (BadImageFormatException)
                {
                    continue;
                }

                state.NoteRegistrationCandidate(new ProbeRegistrationCandidate(
                    registration.SourceAssembly,
                    registration.DeclaringType,
                    ".ctor",
                    MetadataTokens.GetToken(constructorHandle),
                    false,
                    signature.ParameterTypes.Select(GetParameterTypeName).ToList(),
                    registration.SourcePath,
                    registration.EntryType));
            }
        }
    }

    private static ReachableMethod? TryResolveReachableMethod(
        MetadataAssembly source,
        int metadataToken,
        IReadOnlyDictionary<string, MetadataAssembly> assemblies,
        ProbeLocalAssemblyIndex localAssemblies)
    {
        try
        {
            return ResolveReachableMethod(
                source,
                MetadataTokens.EntityHandle(metadataToken),
                assemblies,
                localAssemblies);
        }
        catch (BadImageFormatException)
        {
            return null;
        }
    }

    private static ReachableMethod? ResolveReachableMethod(
        MetadataAssembly source,
        EntityHandle handle,
        IReadOnlyDictionary<string, MetadataAssembly> assemblies,
        ProbeLocalAssemblyIndex localAssemblies)
    {
        if (handle.Kind == HandleKind.MethodSpecification)
        {
            return ResolveReachableMethod(
                source,
                source.Reader.GetMethodSpecification((MethodSpecificationHandle)handle).Method,
                assemblies,
                localAssemblies);
        }
        if (handle.Kind == HandleKind.MethodDefinition)
        {
            return new(source.Path, MetadataTokens.GetToken((MethodDefinitionHandle)handle));
        }
        if (handle.Kind != HandleKind.MemberReference)
        {
            return null;
        }

        var member = source.Reader.GetMemberReference((MemberReferenceHandle)handle);
        MetadataAssembly targetAssembly;
        string declaringType;
        switch (member.Parent.Kind)
        {
            case HandleKind.TypeDefinition:
                targetAssembly = source;
                declaringType = GetTypeFullName(source.Reader, (TypeDefinitionHandle)member.Parent);
                break;
            case HandleKind.TypeReference:
                var typeReference = (TypeReferenceHandle)member.Parent;
                declaringType = GetTypeFullName(source.Reader, typeReference);
                if (!TryResolveTypeReferenceAssembly(
                    source,
                    typeReference,
                    assemblies,
                    localAssemblies,
                    out targetAssembly))
                {
                    return null;
                }
                break;
            default:
                return null;
        }

        if (!targetAssembly.TryGetTypeDefinition(declaringType, out var targetType))
        {
            return null;
        }

        MethodSignature<MetadataTypeShape> referenceSignature;
        try
        {
            referenceSignature = member.DecodeMethodSignature(source.Provider, null);
        }
        catch (BadImageFormatException)
        {
            return null;
        }

        var memberName = source.Reader.GetString(member.Name);
        List<MethodDefinitionHandle> matches = [];
        foreach (var candidateHandle in targetAssembly.Reader.GetTypeDefinition(targetType).GetMethods())
        {
            var candidate = targetAssembly.Reader.GetMethodDefinition(candidateHandle);
            if (!targetAssembly.Reader.GetString(candidate.Name).Equals(memberName, StringComparison.Ordinal))
            {
                continue;
            }
            try
            {
                if (MethodSignaturesMatch(
                    referenceSignature,
                    candidate.DecodeSignature(targetAssembly.Provider, null),
                    candidate))
                {
                    matches.Add(candidateHandle);
                }
            }
            catch (BadImageFormatException)
            {
                // An undecodable overload cannot be proven as the referenced target.
            }
        }

        return matches.Count == 1
            ? new(targetAssembly.Path, MetadataTokens.GetToken(matches[0]))
            : null;
    }

    private static bool TryResolveTypeReferenceAssembly(
        MetadataAssembly source,
        TypeReferenceHandle typeHandle,
        IReadOnlyDictionary<string, MetadataAssembly> assemblies,
        ProbeLocalAssemblyIndex localAssemblies,
        out MetadataAssembly target)
    {
        EntityHandle scope = source.Reader.GetTypeReference(typeHandle).ResolutionScope;
        while (scope.Kind == HandleKind.TypeReference)
        {
            scope = source.Reader.GetTypeReference((TypeReferenceHandle)scope).ResolutionScope;
        }

        if (scope.Kind == HandleKind.ModuleDefinition)
        {
            target = source;
            return true;
        }
        if (scope.Kind != HandleKind.AssemblyReference)
        {
            target = null!;
            return false;
        }

        var reference = source.Reader.GetAssemblyReference((AssemblyReferenceHandle)scope);
        var name = source.Reader.GetString(reference.Name);
        var assemblyName = CreateAssemblyName(source.Reader, reference, name);
        if (!localAssemblies.TryResolve(
            assemblyName,
            Path.GetDirectoryName(source.Path),
            out var targetPath,
            out _)
            || !assemblies.TryGetValue(targetPath, out target!))
        {
            target = null!;
            return false;
        }
        return true;
    }

    private static bool MethodSignaturesMatch(
        MethodSignature<MetadataTypeShape> reference,
        MethodSignature<MetadataTypeShape> candidate,
        MethodDefinition candidateMethod)
    {
        var candidateIsInstance = (candidateMethod.Attributes & MethodAttributes.Static) == 0;
        return reference.Header.IsInstance == candidateIsInstance
            && reference.GenericParameterCount == candidate.GenericParameterCount
            && GetParameterTypeName(reference.ReturnType) == GetParameterTypeName(candidate.ReturnType)
            && reference.ParameterTypes.Length == candidate.ParameterTypes.Length
            && reference.ParameterTypes
                .Zip(candidate.ParameterTypes)
                .All(pair => GetParameterTypeName(pair.First) == GetParameterTypeName(pair.Second));
    }

    private static bool TryGetMethodDefinition(
        MetadataReader reader,
        int metadataToken,
        out MethodDefinition method)
    {
        method = default;
        try
        {
            var handle = MetadataTokens.EntityHandle(metadataToken);
            if (handle.Kind != HandleKind.MethodDefinition)
            {
                return false;
            }
            method = reader.GetMethodDefinition((MethodDefinitionHandle)handle);
            return true;
        }
        catch (BadImageFormatException)
        {
            return false;
        }
    }

    private static GmcmMethodEvidence GetGmcmMethodEvidence(
        PEReader peReader,
        MetadataReader reader,
        MetadataTypeProvider provider,
        MethodDefinition method)
    {
        if (method.RelativeVirtualAddress == 0)
        {
            return default;
        }

        var hasUniqueId = false;
        var hasRegistrationCall = false;
        try
        {
            var ilReader = peReader.GetMethodBody(method.RelativeVirtualAddress).GetILReader();
            while (ilReader.RemainingBytes > 0)
            {
                var instruction = ReadInstruction(ref ilReader);
                if (instruction.OpCode == OpCodes.Ldstr
                    && instruction.MetadataToken is int stringToken
                    && TryGetUserString(reader, stringToken) is { } value
                    && value.Contains(GmcmUniqueId, StringComparison.OrdinalIgnoreCase))
                {
                    hasUniqueId = true;
                }

                if ((instruction.OpCode == OpCodes.Call || instruction.OpCode == OpCodes.Callvirt)
                    && instruction.MetadataToken is int methodToken
                    && TryResolveCalledMethod(reader, provider, methodToken) is { } calledMethod
                    && IsGmcmRegistrationCall(calledMethod))
                {
                    hasRegistrationCall = true;
                }
            }
        }
        catch (BadImageFormatException)
        {
            return new(hasUniqueId, hasRegistrationCall);
        }

        return new(hasUniqueId, hasRegistrationCall);
    }

    private static bool IsExecutableRegistrationCandidate(
        string methodName,
        bool signatureReferencesGmcm,
        bool isGameLaunchedHandler)
    {
        if (methodName.Equals("Entry", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }
        if (methodName.Equals(".ctor", StringComparison.Ordinal))
        {
            return true;
        }
        return signatureReferencesGmcm
            || isGameLaunchedHandler
            || new[] { "config", "gmcm", "menu", "register", "setup" }
            .Any(marker => methodName.Contains(marker, StringComparison.OrdinalIgnoreCase));
    }

    private static DecodedInstruction ReadInstruction(ref BlobReader reader)
    {
        var first = reader.ReadByte();
        var value = first == 0xfe
            ? (ushort)(0xfe00 | reader.ReadByte())
            : first;
        if (!IlOpCodes.TryGetValue(value, out var opCode))
        {
            throw new BadImageFormatException($"Unknown IL opcode 0x{value:x4}.");
        }

        int? metadataToken = null;
        switch (opCode.OperandType)
        {
            case OperandType.InlineNone:
                break;
            case OperandType.ShortInlineBrTarget:
            case OperandType.ShortInlineI:
            case OperandType.ShortInlineVar:
                reader.ReadByte();
                break;
            case OperandType.InlineVar:
                reader.ReadUInt16();
                break;
            case OperandType.InlineI:
            case OperandType.InlineBrTarget:
            case OperandType.ShortInlineR:
                reader.ReadInt32();
                break;
            case OperandType.InlineI8:
            case OperandType.InlineR:
                reader.ReadInt64();
                break;
            case OperandType.InlineField:
            case OperandType.InlineMethod:
            case OperandType.InlineSig:
            case OperandType.InlineString:
            case OperandType.InlineTok:
            case OperandType.InlineType:
                metadataToken = reader.ReadInt32();
                break;
            case OperandType.InlineSwitch:
                var count = reader.ReadInt32();
                if (count < 0 || count > reader.RemainingBytes / sizeof(int))
                {
                    throw new BadImageFormatException("Invalid IL switch operand.");
                }
                for (var index = 0; index < count; index++)
                {
                    reader.ReadInt32();
                }
                break;
            default:
                throw new BadImageFormatException($"Unsupported IL operand type {opCode.OperandType}.");
        }

        return new(opCode, metadataToken);
    }

    private static string? TryGetUserString(MetadataReader reader, int metadataToken)
    {
        try
        {
            return reader.GetUserString(MetadataTokens.UserStringHandle(metadataToken));
        }
        catch (BadImageFormatException)
        {
            return null;
        }
    }

    private static CalledMethod? TryResolveCalledMethod(
        MetadataReader reader,
        MetadataTypeProvider provider,
        int metadataToken)
    {
        try
        {
            return ResolveCalledMethod(reader, provider, MetadataTokens.EntityHandle(metadataToken));
        }
        catch (BadImageFormatException)
        {
            return null;
        }
    }

    private static CalledMethod? ResolveCalledMethod(
        MetadataReader reader,
        MetadataTypeProvider provider,
        EntityHandle handle)
    {
        switch (handle.Kind)
        {
            case HandleKind.MemberReference:
                var member = reader.GetMemberReference((MemberReferenceHandle)handle);
                return new(reader.GetString(member.Name), GetEntityTypeFullName(reader, provider, member.Parent));
            case HandleKind.MethodDefinition:
                var method = reader.GetMethodDefinition((MethodDefinitionHandle)handle);
                return new(reader.GetString(method.Name), GetTypeFullName(reader, method.GetDeclaringType()));
            case HandleKind.MethodSpecification:
                var specification = reader.GetMethodSpecification((MethodSpecificationHandle)handle);
                return ResolveCalledMethod(reader, provider, specification.Method);
            default:
                return null;
        }
    }

    private static string GetEntityTypeFullName(
        MetadataReader reader,
        MetadataTypeProvider provider,
        EntityHandle handle)
    {
        return handle.Kind switch
        {
            HandleKind.TypeDefinition => GetTypeFullName(reader, (TypeDefinitionHandle)handle),
            HandleKind.TypeReference => GetTypeFullName(reader, (TypeReferenceHandle)handle),
            HandleKind.TypeSpecification => reader.GetTypeSpecification((TypeSpecificationHandle)handle)
                .DecodeSignature(provider, null).FullName ?? "<unknown>",
            HandleKind.MethodDefinition => GetTypeFullName(
                reader,
                reader.GetMethodDefinition((MethodDefinitionHandle)handle).GetDeclaringType()),
            _ => "<unknown>",
        };
    }

    private static bool IsGmcmRegistrationCall(CalledMethod method)
    {
        var isRegistrationMethod = method.Name.Equals("Register", StringComparison.Ordinal)
            || (method.Name.StartsWith("Add", StringComparison.Ordinal)
                && method.Name.EndsWith("Option", StringComparison.Ordinal));
        return isRegistrationMethod && ContainsGmcm(method.DeclaringType);
    }

    private static string GetParameterTypeName(MetadataTypeShape shape)
    {
        return string.IsNullOrWhiteSpace(shape.FullName) ? "<unknown>" : shape.FullName;
    }

    private static string GetTypeFullName(MetadataReader reader, TypeDefinitionHandle handle)
    {
        var type = reader.GetTypeDefinition(handle);
        var declaringType = type.GetDeclaringType();
        return declaringType.IsNil
            ? GetFullName(reader.GetString(type.Namespace), reader.GetString(type.Name))
            : $"{GetTypeFullName(reader, declaringType)}+{reader.GetString(type.Name)}";
    }

    private static string GetTypeFullName(MetadataReader reader, TypeReferenceHandle handle)
    {
        var type = reader.GetTypeReference(handle);
        return type.ResolutionScope.Kind == HandleKind.TypeReference
            ? $"{GetTypeFullName(reader, (TypeReferenceHandle)type.ResolutionScope)}+{reader.GetString(type.Name)}"
            : GetFullName(reader.GetString(type.Namespace), reader.GetString(type.Name));
    }

    private static string GetFullName(string typeNamespace, string name)
    {
        return string.IsNullOrEmpty(typeNamespace) ? name : $"{typeNamespace}.{name}";
    }

    private static IReadOnlyDictionary<ushort, OpCode> BuildIlOpCodeMap()
    {
        return typeof(OpCodes)
            .GetFields(BindingFlags.Public | BindingFlags.Static)
            .Where(field => field.FieldType == typeof(OpCode))
            .Select(field => (OpCode)field.GetValue(null)!)
            .ToDictionary(opCode => unchecked((ushort)opCode.Value));
    }

    private static void CollectFields(
        MetadataReader reader,
        MetadataTypeProvider provider,
        TypeDefinition type,
        ProbeState state)
    {
        foreach (var handle in type.GetFields())
        {
            var field = reader.GetFieldDefinition(handle);
            if ((field.Attributes & FieldAttributes.FieldAccessMask) != FieldAttributes.Public
                || (field.Attributes & FieldAttributes.Static) != 0
                || (field.Attributes & FieldAttributes.SpecialName) != 0
                || IsIgnoredJsonMember(reader, provider, field.GetCustomAttributes()))
            {
                continue;
            }

            var shape = field.DecodeSignature(provider, null);
            var name = GetSerializedMemberName(
                reader,
                provider,
                field.GetCustomAttributes(),
                reader.GetString(field.Name));
            TryAddField(reader, state, name, shape);
        }
    }

    private static void CollectProperties(
        MetadataReader reader,
        MetadataTypeProvider provider,
        TypeDefinition type,
        ProbeState state)
    {
        foreach (var handle in type.GetProperties())
        {
            var property = reader.GetPropertyDefinition(handle);
            var accessors = property.GetAccessors();
            var getterIsPublic = IsPublicInstanceMethod(reader, accessors.Getter);
            var setterIsPublic = IsPublicInstanceMethod(reader, accessors.Setter);
            if ((!getterIsPublic && !setterIsPublic)
                || IsIgnoredJsonMember(reader, provider, property.GetCustomAttributes()))
            {
                continue;
            }

            var signature = property.DecodeSignature(provider, null);
            if (signature.ParameterTypes.Length != 0)
            {
                continue;
            }

            var name = GetSerializedMemberName(
                reader,
                provider,
                property.GetCustomAttributes(),
                reader.GetString(property.Name));
            TryAddField(reader, state, name, signature.ReturnType);
        }
    }

    private static string GetSerializedMemberName(
        MetadataReader reader,
        MetadataTypeProvider provider,
        CustomAttributeHandleCollection attributes,
        string fallback)
    {
        foreach (var handle in attributes)
        {
            try
            {
                var attribute = reader.GetCustomAttribute(handle);
                var attributeName = GetCustomAttributeTypeFullName(reader, provider, attribute);
                if (attributeName is not "Newtonsoft.Json.JsonPropertyAttribute"
                    and not "System.Text.Json.Serialization.JsonPropertyNameAttribute")
                {
                    continue;
                }

                var value = attribute.DecodeValue(provider);
                var namedValue = value.NamedArguments
                    .FirstOrDefault(argument => argument.Name is "PropertyName" or "Name")
                    .Value as string;
                var constructorValue = value.FixedArguments
                    .FirstOrDefault(argument => argument.Value is string)
                    .Value as string;
                var serializedName = namedValue ?? constructorValue;
                if (!string.IsNullOrWhiteSpace(serializedName))
                {
                    return serializedName;
                }
            }
            catch (BadImageFormatException)
            {
                // Malformed attributes cannot provide a reliable serialized name.
            }
        }

        return fallback;
    }

    private static bool IsIgnoredJsonMember(
        MetadataReader reader,
        MetadataTypeProvider provider,
        CustomAttributeHandleCollection attributes)
    {
        foreach (var handle in attributes)
        {
            CustomAttribute attribute;
            string attributeName;
            try
            {
                attribute = reader.GetCustomAttribute(handle);
                attributeName = GetCustomAttributeTypeFullName(reader, provider, attribute);
            }
            catch (BadImageFormatException)
            {
                continue;
            }

            if (attributeName == "Newtonsoft.Json.JsonIgnoreAttribute")
            {
                return true;
            }
            if (attributeName != "System.Text.Json.Serialization.JsonIgnoreAttribute")
            {
                continue;
            }

            try
            {
                var value = attribute.DecodeValue(provider);
                var condition = value.NamedArguments
                    .FirstOrDefault(argument => argument.Name == "Condition")
                    .Value;
                return condition is null || Convert.ToInt32(condition) == 1;
            }
            catch
            {
                // A JsonIgnore attribute that cannot be decoded is excluded conservatively.
                return true;
            }
        }

        return false;
    }

    private static string GetCustomAttributeTypeFullName(
        MetadataReader reader,
        MetadataTypeProvider provider,
        CustomAttribute attribute)
    {
        return attribute.Constructor.Kind switch
        {
            HandleKind.MemberReference => GetEntityTypeFullName(
                reader,
                provider,
                reader.GetMemberReference((MemberReferenceHandle)attribute.Constructor).Parent),
            HandleKind.MethodDefinition => GetTypeFullName(
                reader,
                reader.GetMethodDefinition((MethodDefinitionHandle)attribute.Constructor).GetDeclaringType()),
            _ => "<unknown>",
        };
    }

    private static bool IsPublicInstanceMethod(MetadataReader reader, MethodDefinitionHandle handle)
    {
        if (handle.IsNil)
        {
            return false;
        }

        var method = reader.GetMethodDefinition(handle);
        return (method.Attributes & MethodAttributes.MemberAccessMask) == MethodAttributes.Public
            && (method.Attributes & MethodAttributes.Static) == 0;
    }

    private static void TryAddField(
        MetadataReader reader,
        ProbeState state,
        string name,
        MetadataTypeShape shape)
    {
        var fieldType = shape.Kind switch
        {
            MetadataValueKind.Boolean => "boolean",
            MetadataValueKind.Integer => "integer",
            MetadataValueKind.Number => "number",
            MetadataValueKind.String or MetadataValueKind.Enum => "string",
            MetadataValueKind.StringArray => "string-array",
            _ => null,
        };
        if (fieldType is null)
        {
            return;
        }

        List<object?> allowedValues = shape.Kind switch
        {
            MetadataValueKind.Boolean => [false, true],
            MetadataValueKind.Enum => GetEnumNames(reader, shape.Definition),
            _ => [],
        };
        state.AddField(new ProbeField(
            name,
            HumanizeKey(name),
            null,
            null,
            fieldType,
            null,
            allowedValues,
            shape.Kind == MetadataValueKind.String,
            shape.Kind == MetadataValueKind.StringArray,
            "dll-static"));
    }

    private static List<object?> GetEnumNames(MetadataReader reader, TypeDefinitionHandle handle)
    {
        if (handle.IsNil)
        {
            return [];
        }

        var type = reader.GetTypeDefinition(handle);
        return type.GetFields()
            .Select(reader.GetFieldDefinition)
            .Where(field => (field.Attributes & FieldAttributes.Literal) != 0
                && (field.Attributes & FieldAttributes.Static) != 0)
            .Select(field => (object?)reader.GetString(field.Name))
            .ToList();
    }

    private static string? FormatPublicKeyToken(MetadataReader reader, BlobHandle handle)
    {
        if (handle.IsNil)
        {
            return null;
        }

        var bytes = reader.GetBlobBytes(handle);
        return bytes.Length == 0 ? null : Convert.ToHexString(bytes).ToLowerInvariant();
    }

    private static bool ContainsGmcm(string? value)
    {
        return value?.Contains(GmcmName, StringComparison.OrdinalIgnoreCase) == true;
    }

    private static string HumanizeKey(string key)
    {
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
        return new string([.. result]).Trim();
    }

    private readonly record struct ReachableMethod(string AssemblyPath, int MetadataToken);

    private readonly record struct ReachabilityWorkItem(ReachableMethod Method, string EntryType);

    private sealed class ReachableMethodComparer : IEqualityComparer<ReachableMethod>
    {
        public bool Equals(ReachableMethod left, ReachableMethod right)
        {
            return left.MetadataToken == right.MetadataToken
                && ProbePathSafety.PathComparer.Equals(left.AssemblyPath, right.AssemblyPath);
        }

        public int GetHashCode(ReachableMethod value)
        {
            return HashCode.Combine(
                ProbePathSafety.PathComparer.GetHashCode(value.AssemblyPath),
                value.MetadataToken);
        }
    }

    private sealed class MetadataAssembly : IDisposable
    {
        private readonly FileStream stream;
        private Dictionary<string, TypeDefinitionHandle>? typesByName;

        public MetadataAssembly(string path)
        {
            Path = ProbePathSafety.ResolveExistingRealPath(path);
            SourceAssembly = System.IO.Path.GetFileName(Path);
            stream = File.OpenRead(Path);
            var peReader = new PEReader(stream, PEStreamOptions.PrefetchEntireImage);
            try
            {
                if (!peReader.HasMetadata)
                {
                    throw new BadImageFormatException($"{SourceAssembly} does not contain .NET metadata.");
                }
                PeReader = peReader;
                Reader = peReader.GetMetadataReader();
            }
            catch
            {
                peReader.Dispose();
                stream.Dispose();
                throw;
            }
        }

        public string Path { get; }

        public string SourceAssembly { get; }

        public PEReader PeReader { get; }

        public MetadataReader Reader { get; }

        public MetadataTypeProvider Provider { get; } = new();

        public bool TryGetTypeDefinition(string fullName, out TypeDefinitionHandle handle)
        {
            typesByName ??= Reader.TypeDefinitions
                .Select(candidate => (Name: GetTypeFullName(Reader, candidate), Handle: candidate))
                .GroupBy(candidate => candidate.Name, StringComparer.Ordinal)
                .Where(group => group.Count() == 1)
                .ToDictionary(group => group.Key, group => group.Single().Handle, StringComparer.Ordinal);
            return typesByName.TryGetValue(fullName, out handle);
        }

        public void Dispose()
        {
            PeReader.Dispose();
            stream.Dispose();
        }
    }

    private enum MetadataValueKind
    {
        Unsupported,
        Boolean,
        Integer,
        Number,
        String,
        StringArray,
        Enum,
    }

    private readonly record struct MetadataTypeShape(
        MetadataValueKind Kind,
        string? FullName = null,
        TypeDefinitionHandle Definition = default);

    private readonly record struct DecodedInstruction(OpCode OpCode, int? MetadataToken);

    private readonly record struct CalledMethod(string Name, string DeclaringType);

    private readonly record struct GmcmMethodEvidence(bool HasUniqueId, bool HasRegistrationCall);

    private sealed class MetadataTypeProvider :
        ISignatureTypeProvider<MetadataTypeShape, object?>,
        ICustomAttributeTypeProvider<MetadataTypeShape>
    {
        public MetadataTypeShape GetArrayType(MetadataTypeShape elementType, ArrayShape shape)
        {
            return shape.Rank == 1 && elementType.Kind == MetadataValueKind.String
                ? new(MetadataValueKind.StringArray, $"{elementType.FullName}[]")
                : new(MetadataValueKind.Unsupported, $"{elementType.FullName}[{new string(',', Math.Max(0, shape.Rank - 1))}]");
        }

        public MetadataTypeShape GetByReferenceType(MetadataTypeShape elementType) =>
            new(MetadataValueKind.Unsupported, $"{elementType.FullName}&");

        public MetadataTypeShape GetFunctionPointerType(MethodSignature<MetadataTypeShape> signature) =>
            new(MetadataValueKind.Unsupported, "methodptr");

        public MetadataTypeShape GetGenericInstantiation(
            MetadataTypeShape genericType,
            ImmutableArray<MetadataTypeShape> typeArguments)
        {
            return genericType.FullName == "System.Nullable`1" && typeArguments.Length == 1
                ? typeArguments[0]
                : new(
                    MetadataValueKind.Unsupported,
                    $"{genericType.FullName}<{string.Join(", ", typeArguments.Select(GetParameterTypeName))}>");
        }

        public MetadataTypeShape GetGenericMethodParameter(object? genericContext, int index) =>
            new(MetadataValueKind.Unsupported, $"!!{index}");

        public MetadataTypeShape GetGenericTypeParameter(object? genericContext, int index) =>
            new(MetadataValueKind.Unsupported, $"!{index}");

        public MetadataTypeShape GetModifiedType(
            MetadataTypeShape modifier,
            MetadataTypeShape unmodifiedType,
            bool isRequired) => unmodifiedType;

        public MetadataTypeShape GetPinnedType(MetadataTypeShape elementType) => elementType;

        public MetadataTypeShape GetPointerType(MetadataTypeShape elementType) =>
            new(MetadataValueKind.Unsupported, $"{elementType.FullName}*");

        public MetadataTypeShape GetPrimitiveType(PrimitiveTypeCode typeCode)
        {
            return typeCode switch
            {
                PrimitiveTypeCode.Boolean => new(MetadataValueKind.Boolean, "System.Boolean"),
                PrimitiveTypeCode.Byte or PrimitiveTypeCode.SByte
                    or PrimitiveTypeCode.Int16 or PrimitiveTypeCode.UInt16
                    or PrimitiveTypeCode.Int32 or PrimitiveTypeCode.UInt32
                    or PrimitiveTypeCode.Int64 or PrimitiveTypeCode.UInt64
                    or PrimitiveTypeCode.IntPtr or PrimitiveTypeCode.UIntPtr =>
                    new(MetadataValueKind.Integer, GetPrimitiveTypeName(typeCode)),
                PrimitiveTypeCode.Single or PrimitiveTypeCode.Double =>
                    new(MetadataValueKind.Number, GetPrimitiveTypeName(typeCode)),
                PrimitiveTypeCode.String => new(MetadataValueKind.String, "System.String"),
                _ => new(MetadataValueKind.Unsupported, GetPrimitiveTypeName(typeCode)),
            };
        }

        public MetadataTypeShape GetSZArrayType(MetadataTypeShape elementType)
        {
            return elementType.Kind == MetadataValueKind.String
                ? new(MetadataValueKind.StringArray, $"{elementType.FullName}[]")
                : new(MetadataValueKind.Unsupported, $"{elementType.FullName}[]");
        }

        public MetadataTypeShape GetTypeFromDefinition(
            MetadataReader metadataReader,
            TypeDefinitionHandle handle,
            byte rawTypeKind)
        {
            var type = metadataReader.GetTypeDefinition(handle);
            var fullName = GetTypeFullName(metadataReader, handle);
            return IsEnum(metadataReader, type)
                ? new(MetadataValueKind.Enum, fullName, handle)
                : ClassifyNamedType(fullName) with { Definition = handle };
        }

        public MetadataTypeShape GetTypeFromReference(
            MetadataReader metadataReader,
            TypeReferenceHandle handle,
            byte rawTypeKind)
        {
            return ClassifyNamedType(GetTypeFullName(metadataReader, handle));
        }

        public MetadataTypeShape GetTypeFromSpecification(
            MetadataReader metadataReader,
            object? genericContext,
            TypeSpecificationHandle handle,
            byte rawTypeKind)
        {
            return metadataReader.GetTypeSpecification(handle).DecodeSignature(this, genericContext);
        }

        public MetadataTypeShape GetSystemType() =>
            new(MetadataValueKind.Unsupported, "System.Type");

        public bool IsSystemType(MetadataTypeShape type) =>
            type.FullName == "System.Type";

        public MetadataTypeShape GetTypeFromSerializedName(string name) =>
            ClassifyNamedType(name);

        public PrimitiveTypeCode GetUnderlyingEnumType(MetadataTypeShape type) =>
            PrimitiveTypeCode.Int32;

        private static MetadataTypeShape ClassifyNamedType(string fullName)
        {
            return fullName switch
            {
                "System.Boolean" => new(MetadataValueKind.Boolean, fullName),
                "System.Byte" or "System.SByte"
                    or "System.Int16" or "System.UInt16"
                    or "System.Int32" or "System.UInt32"
                    or "System.Int64" or "System.UInt64"
                    or "System.IntPtr" or "System.UIntPtr" => new(MetadataValueKind.Integer, fullName),
                "System.Single" or "System.Double" or "System.Decimal" => new(MetadataValueKind.Number, fullName),
                "System.String" => new(MetadataValueKind.String, fullName),
                _ => new(MetadataValueKind.Unsupported, fullName),
            };
        }

        private static bool IsEnum(MetadataReader metadataReader, TypeDefinition type)
        {
            return type.BaseType.Kind == HandleKind.TypeReference
                && metadataReader.GetTypeReference((TypeReferenceHandle)type.BaseType) is var baseType
                && metadataReader.GetString(baseType.Namespace) == "System"
                && metadataReader.GetString(baseType.Name) == "Enum";
        }

        private static string GetPrimitiveTypeName(PrimitiveTypeCode typeCode)
        {
            return typeCode switch
            {
                PrimitiveTypeCode.Boolean => "System.Boolean",
                PrimitiveTypeCode.Byte => "System.Byte",
                PrimitiveTypeCode.SByte => "System.SByte",
                PrimitiveTypeCode.Int16 => "System.Int16",
                PrimitiveTypeCode.UInt16 => "System.UInt16",
                PrimitiveTypeCode.Int32 => "System.Int32",
                PrimitiveTypeCode.UInt32 => "System.UInt32",
                PrimitiveTypeCode.Int64 => "System.Int64",
                PrimitiveTypeCode.UInt64 => "System.UInt64",
                PrimitiveTypeCode.IntPtr => "System.IntPtr",
                PrimitiveTypeCode.UIntPtr => "System.UIntPtr",
                PrimitiveTypeCode.Single => "System.Single",
                PrimitiveTypeCode.Double => "System.Double",
                PrimitiveTypeCode.Char => "System.Char",
                PrimitiveTypeCode.Object => "System.Object",
                PrimitiveTypeCode.String => "System.String",
                PrimitiveTypeCode.TypedReference => "System.TypedReference",
                PrimitiveTypeCode.Void => "System.Void",
                _ => "<unknown>",
            };
        }
    }
}
