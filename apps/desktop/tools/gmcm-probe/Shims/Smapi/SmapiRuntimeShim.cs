namespace StardewModdingAPI
{
    public abstract class Mod : IMod, IModLinked
    {
        public IModHelper Helper { get; set; } = null!;
        public IMonitor Monitor { get; set; } = null!;
        public IManifest ModManifest { get; set; } = null!;
        public string ModID => ModManifest.UniqueID;

        public abstract void Entry(IModHelper helper);

        protected TApi? GetApi<TApi>(string uniqueId) where TApi : class => Helper.ModRegistry.GetApi<TApi>(uniqueId);
        protected object? GetApi() => null;
    }

    public interface IMod
    {
        IModHelper Helper { get; }
        IMonitor Monitor { get; }
        IManifest ModManifest { get; }
    }

    public interface IModHelper
    {
        string DirectoryPath { get; }
        IModRegistry ModRegistry { get; }
        Events.IModEvents Events { get; }
        ITranslationHelper Translation { get; }
        IDataHelper Data { get; }
        IMonitor Monitor { get; }
        IModContentHelper ModContent { get; }
        IGameContentHelper GameContent { get; }
        IContentPackHelper ContentPacks { get; }
        IInputHelper Input { get; }
        IReflectionHelper Reflection { get; }
        ICommandHelper ConsoleCommands { get; }
        IMultiplayerHelper Multiplayer { get; }
        TConfig ReadConfig<TConfig>() where TConfig : class, new();
        void WriteConfig<TConfig>(TConfig config) where TConfig : class, new();
    }

    public interface IModRegistry
    {
        TApi? GetApi<TApi>(string uniqueId) where TApi : class;
        IModInfo? Get(string uniqueId);
        IEnumerable<IModInfo> GetAll();
        bool IsLoaded(string uniqueId);
    }

    public interface IModInfo
    {
        IManifest Manifest { get; }
    }

    public interface IMonitor
    {
        void Log(string message, LogLevel level = LogLevel.Trace);
        void LogOnce(string message, LogLevel level = LogLevel.Trace);
        void VerboseLog(string message);
    }

    public interface ITranslationHelper
    {
        Translation Get(string key);
        Translation Get(string key, object? tokens);
        IEnumerable<Translation> GetInAllLocales(string key);
        IEnumerable<Translation> GetTranslations();
    }

    public interface IDataHelper
    {
        TModel? ReadJsonFile<TModel>(string path);
        TModel? ReadGlobalData<TModel>(string key);
        void WriteGlobalData<TModel>(string key, TModel? data);
    }

    public interface IContentHelper
    {
        TModel Load<TModel>(string key);
        TModel Load<TModel>(string key, ContentSource source);
        bool InvalidateCache(string key);
    }

    public interface IModContentHelper : IContentHelper, IModLinked
    {
        new TModel Load<TModel>(string key);
        new TModel Load<TModel>(string key, ContentSource source);
        new bool InvalidateCache(string key);
    }

    public interface IGameContentHelper : IContentHelper
    {
        new TModel Load<TModel>(string key);
        new TModel Load<TModel>(string key, ContentSource source);
        new bool InvalidateCache(string key);
    }

    public interface IContentPackHelper
    {
        IEnumerable<IContentPack> GetOwned();
        IContentPack? GetOwned(string id);
    }

    public interface IInputHelper
    {
    }

    public interface IReflectionHelper
    {
        IReflectedField<TValue> GetField<TValue>(object obj, string name, bool required = true);
        IReflectedField<TValue> GetField<TValue>(Type type, string name, bool required = true);
    }

    public interface IReflectedField<TValue>
    {
        TValue GetValue();
        void SetValue(TValue value);
    }

    public interface ICommandHelper
    {
        ICommandHelper Add(string name, string documentation, Action<string, string[]> callback);
    }

    public interface IMultiplayerHelper
    {
        void SendMessage<TMessage>(TMessage message, string messageType, string[]? modIDs = null, long[]? playerIDs = null);
    }

    public sealed class SemanticVersion(string value) : ISemanticVersion
    {
        public bool IsOlderThan(string version) => false;
        public bool IsOlderThan(ISemanticVersion version) => false;
        public bool IsNewerThan(string version) => false;
        public bool IsNewerThan(ISemanticVersion version) => false;
        public override string ToString() => value;
    }

    public sealed class Translation
    {
        private readonly string value;
        public Translation(string value) => this.value = value;
        public Translation(string key, string locale, string value) => this.value = value;
        public Translation(string key, string locale, string value, object? tokens) => this.value = value;
        public override string ToString() => value;
        public static implicit operator string(Translation translation) => translation.ToString();
    }

    public enum LogLevel
    {
        Trace,
        Debug,
        Info,
        Warn,
        Error,
        Alert
    }

    public enum GamePlatform
    {
        Android,
        Linux,
        Mac,
        Windows
    }

    public enum SButton
    {
        None = 0,
        P = 80,
        I = 73,
        NumPad1 = 97,
        NumPad2 = 98
    }

    public enum ContentSource
    {
        GameContent,
        ModFolder
    }

    public enum PatchMode
    {
        Replace,
        Overlay,
    }

    public enum PatchMapMode
    {
        Replace,
        Overlay,
    }

    public static class Constants
    {
        private const string GameVersionText = "1.6.0";
        private const string ApiVersionText = "4.0.0";
        public static ISemanticVersion GameVersion { get; } = new SemanticVersion(GameVersionText);
        public static ISemanticVersion ApiVersion { get; } = new SemanticVersion(ApiVersionText);
        public static readonly ISemanticVersion GameVersionObject = GameVersion;
        public static readonly ISemanticVersion ApiVersionObject = ApiVersion;
        public static GamePlatform TargetPlatform => GamePlatform.Windows;
        public static GamePlatform Platform => TargetPlatform;
    }

    public interface IModLinked
    {
        string ModID { get; }
    }

    public interface IContentPack
    {
        string DirectoryPath { get; }
        IManifest Manifest { get; }
        bool HasFile(string path);
        TModel? ReadJsonFile<TModel>(string path);
    }

}
