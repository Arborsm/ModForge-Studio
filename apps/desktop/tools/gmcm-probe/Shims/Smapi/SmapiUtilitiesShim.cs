namespace StardewModdingAPI.Utilities
{
    public static class PathUtilities
    {
        public static string NormalizePath(string path) => path.Replace('\\', '/');
        public static string NormalizeAssetName(string path) => NormalizePath(path);
        public static string GetSegments(string path) => NormalizePath(path);
    }

    public sealed class KeybindList
    {
        public KeybindList()
        {
        }

        public KeybindList(StardewModdingAPI.SButton button)
        {
        }

        public KeybindList(Keybind[] keybinds)
        {
        }

        public static KeybindList Parse(string value) => new();
        public static KeybindList ForSingle(params StardewModdingAPI.SButton[] buttons) => new();

        public bool JustPressed() => false;

        public override string ToString() => "";
    }

    public sealed class Keybind
    {
        public Keybind()
        {
        }

        public Keybind(StardewModdingAPI.SButton button)
        {
        }

        public bool JustPressed() => false;

        public override string ToString() => "";
    }

    public sealed class PerScreen<T>
    {
        private T value;

        public PerScreen()
        {
            value = default!;
        }

        public PerScreen(T initialValue)
        {
            value = initialValue;
        }

        public PerScreen(Func<T> initialValueFactory)
        {
            try
            {
                value = initialValueFactory();
            }
            catch
            {
                value = default!;
            }
        }

        public T Value
        {
            get => value;
            set => this.value = value;
        }

        public bool IsActiveForScreen() => false;

        public static implicit operator T(PerScreen<T> perScreen) => perScreen.Value;
    }
}
