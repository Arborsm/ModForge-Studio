using StardewModdingAPI;
using StardewModdingAPI.Events;

namespace ModForge.DebugBridge;

/// <summary>Mod configuration read from config.json.</summary>
public sealed class ModConfig
{
    /// <summary>Localhost TCP port the bridge listens on.</summary>
    public int Port { get; set; } = 5847;
}

/// <summary>SMAPI entry point: hosts the localhost bridge server and executes queued studio commands on the game thread.</summary>
public sealed class ModEntry : Mod
{
    private const int MaxJobsPerTick = 16;

    private BridgeServer? server;
    private CommandDispatcher? dispatcher;

    public override void Entry(IModHelper helper)
    {
        ModConfig config = helper.ReadConfig<ModConfig>();
        TempAssetPatcher tempPatcher = new(helper);
        this.dispatcher = new CommandDispatcher(helper, this.ModManifest, this.Monitor, tempPatcher);
        this.server = new BridgeServer(
            config.Port,
            message => this.Monitor.Log(message, LogLevel.Info),
            message => this.Monitor.Log(message, LogLevel.Warn));

        try
        {
            this.server.Start();
        }
        catch (Exception ex)
        {
            this.Monitor.Log($"Could not start the debug bridge on port {config.Port}: {ex.Message}. Change the Port in config.json and restart.", LogLevel.Error);
            this.server = null;
            return;
        }

        helper.Events.GameLoop.UpdateTicked += this.OnUpdateTicked;
        helper.Events.GameLoop.ReturnedToTitle += this.OnReturnedToTitle;
    }

    private void OnUpdateTicked(object? sender, UpdateTickedEventArgs e)
    {
        if (this.server is null || this.dispatcher is null)
            return;

        for (int i = 0; i < MaxJobsPerTick && this.server.PendingJobs.TryDequeue(out BridgeJob? job); i++)
        {
            BridgeResponse response = this.dispatcher.Execute(job.Request);
            job.Completion.TrySetResult(response);
        }
    }

    private void OnReturnedToTitle(object? sender, ReturnedToTitleEventArgs e)
    {
        // temp entries reference save-specific content; drop them when the save unloads
        this.dispatcher?.Execute(new BridgeRequest { Id = 0, Command = "clear-temp-entries" });
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
            this.server?.Dispose();
        base.Dispose(disposing);
    }
}
