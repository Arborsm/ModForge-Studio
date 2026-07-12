namespace StardewModdingAPI
{
    public interface IManifest
    {
        string Name { get; }
        string Author { get; }
        string Description { get; }
        string UniqueID { get; }
        ISemanticVersion Version { get; }
    }

    public interface ISemanticVersion
    {
        bool IsOlderThan(string version);
        bool IsOlderThan(ISemanticVersion version);
        bool IsNewerThan(string version);
        bool IsNewerThan(ISemanticVersion version);
        string ToString();
    }

}
