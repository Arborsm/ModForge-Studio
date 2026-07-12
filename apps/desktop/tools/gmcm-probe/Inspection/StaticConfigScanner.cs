internal static class StaticConfigScanner
{
    public static void Collect(string dll, ProbeRequest request, ProbeState state)
    {
        try
        {
            MetadataInspector.Inspect(dll, state, collectFields: true);
        }
        catch (Exception ex)
        {
            state.Warn($"{Path.GetFileName(dll)} static metadata could not be inspected: {ex.GetBaseException().Message}");
        }
    }
}
