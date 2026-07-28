using StardewModdingAPI;
using StardewModdingAPI.Events;

namespace ModForge.DebugBridge;

/// <summary>Applies temporary in-memory string-dictionary entry edits (the studio's "temp CP entry" debugging), reverted on removal or game restart.</summary>
public sealed class TempAssetPatcher
{
    private readonly IModHelper helper;
    private readonly object sync = new();
    private readonly Dictionary<string, Dictionary<string, string>> entriesByAsset = new(StringComparer.OrdinalIgnoreCase);

    public TempAssetPatcher(IModHelper helper)
    {
        this.helper = helper;
        helper.Events.Content.AssetRequested += this.OnAssetRequested;
    }

    /// <summary>Sets one temporary entry and invalidates the target asset so the game reloads it.</summary>
    public void SetEntry(string assetName, string key, string value)
    {
        lock (this.sync)
        {
            if (!this.entriesByAsset.TryGetValue(assetName, out Dictionary<string, string>? entries))
            {
                entries = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                this.entriesByAsset[assetName] = entries;
            }
            entries[key] = value;
        }
        this.helper.GameContent.InvalidateCache(assetName);
    }

    /// <summary>Removes one temporary entry (or all entries for the asset when key is null) and invalidates the asset.</summary>
    public void RemoveEntries(string assetName, string? key)
    {
        bool changed = false;
        lock (this.sync)
        {
            if (this.entriesByAsset.TryGetValue(assetName, out Dictionary<string, string>? entries))
            {
                if (key is null)
                    changed = this.entriesByAsset.Remove(assetName);
                else
                {
                    changed = entries.Remove(key);
                    if (entries.Count == 0)
                        this.entriesByAsset.Remove(assetName);
                }
            }
        }
        if (changed)
            this.helper.GameContent.InvalidateCache(assetName);
    }

    /// <summary>Removes every temporary entry and invalidates all affected assets.</summary>
    public void Clear()
    {
        string[] assets;
        lock (this.sync)
        {
            assets = this.entriesByAsset.Keys.ToArray();
            this.entriesByAsset.Clear();
        }
        foreach (string asset in assets)
            this.helper.GameContent.InvalidateCache(asset);
    }

    /// <summary>Lists active temporary entries as assetName → keys.</summary>
    public Dictionary<string, string[]> List()
    {
        lock (this.sync)
        {
            return this.entriesByAsset.ToDictionary(pair => pair.Key, pair => pair.Value.Keys.ToArray());
        }
    }

    private void OnAssetRequested(object? sender, AssetRequestedEventArgs e)
    {
        Dictionary<string, string>? entries;
        lock (this.sync)
        {
            if (!this.entriesByAsset.TryGetValue(e.NameWithoutLocale.Name, out entries) || entries.Count == 0)
                return;
            entries = new Dictionary<string, string>(entries, StringComparer.OrdinalIgnoreCase);
        }

        e.Edit(asset =>
        {
            IDictionary<string, string> data = asset.AsDictionary<string, string>().Data;
            foreach ((string key, string value) in entries)
                data[key] = value;
        }, AssetEditPriority.Late);
    }
}
