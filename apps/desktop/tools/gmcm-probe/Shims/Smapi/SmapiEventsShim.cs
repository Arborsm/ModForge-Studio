namespace StardewModdingAPI.Events
{
    public interface IModEvents
    {
        IGameLoopEvents GameLoop { get; }
        IInputEvents Input { get; }
        IContentEvents Content { get; }
        IDisplayEvents Display { get; }
        IGameServerEvents GameServer { get; }
        IMultiplayerEvents Multiplayer { get; }
        IPlayerEvents Player { get; }
        ISpecializedEvents Specialized { get; }
        IWorldEvents World { get; }
    }

    public enum AssetLoadPriority
    {
        Low,
        Medium,
        High,
        Exclusive
    }

    public enum AssetEditPriority
    {
        Default,
        Early,
        Late
    }

    public interface IGameLoopEvents
    {
        event EventHandler<GameLaunchedEventArgs> GameLaunched;
        event EventHandler<ReturnedToTitleEventArgs> ReturnedToTitle;
        event EventHandler<SaveCreatedEventArgs> SaveCreated;
        event EventHandler<SaveCreatingEventArgs> SaveCreating;
        event EventHandler<SaveLoadedEventArgs> SaveLoaded;
        event EventHandler<SavedEventArgs> Saved;
        event EventHandler<SavingEventArgs> Saving;
        event EventHandler<DayStartedEventArgs> DayStarted;
        event EventHandler<DayEndingEventArgs> DayEnding;
        event EventHandler<TimeChangedEventArgs> TimeChanged;
        event EventHandler<OneSecondUpdateTickingEventArgs> OneSecondUpdateTicking;
        event EventHandler<UpdateTickedEventArgs> UpdateTicked;
        event EventHandler<UpdateTickingEventArgs> UpdateTicking;
        event EventHandler<OneSecondUpdateTickedEventArgs> OneSecondUpdateTicked;
    }

    public interface IInputEvents
    {
        event EventHandler<ButtonPressedEventArgs> ButtonPressed;
        event EventHandler<ButtonsChangedEventArgs> ButtonsChanged;
        event EventHandler<ButtonReleasedEventArgs> ButtonReleased;
        event EventHandler<CursorMovedEventArgs> CursorMoved;
        event EventHandler<MouseWheelScrolledEventArgs> MouseWheelScrolled;
    }

    public interface IContentEvents
    {
        event EventHandler<AssetRequestedEventArgs> AssetRequested;
        event EventHandler<AssetsInvalidatedEventArgs> AssetsInvalidated;
        event EventHandler<AssetReadyEventArgs> AssetReady;
        event EventHandler<LocaleChangedEventArgs> LocaleChanged;
    }

    public interface IDisplayEvents
    {
        event EventHandler<MenuChangedEventArgs> MenuChanged;
        event EventHandler<RenderingEventArgs> Rendering;
        event EventHandler<RenderingStepEventArgs> RenderingStep;
        event EventHandler<RenderedEventArgs> Rendered;
        event EventHandler<RenderedStepEventArgs> RenderedStep;
        event EventHandler<RenderedActiveMenuEventArgs> RenderedActiveMenu;
        event EventHandler<RenderingHudEventArgs> RenderingHud;
        event EventHandler<RenderedHudEventArgs> RenderedHud;
        event EventHandler<RenderingWorldEventArgs> RenderingWorld;
        event EventHandler<RenderedWorldEventArgs> RenderedWorld;
        event EventHandler<WindowResizedEventArgs> WindowResized;
    }

    public interface IGameServerEvents
    {
        event EventHandler<ClientConnectedEventArgs> ClientConnected;
        event EventHandler<ClientDisconnectedEventArgs> ClientDisconnected;
        event EventHandler<ModMessageReceivedEventArgs> ModMessageReceived;
    }

    public interface IMultiplayerEvents
    {
        event EventHandler<ModMessageReceivedEventArgs> ModMessageReceived;
        event EventHandler<PeerContextReceivedEventArgs> PeerContextReceived;
        event EventHandler<PeerConnectedEventArgs> PeerConnected;
        event EventHandler<PeerDisconnectedEventArgs> PeerDisconnected;
    }

    public interface IPlayerEvents
    {
        event EventHandler<InventoryChangedEventArgs> InventoryChanged;
        event EventHandler<LevelChangedEventArgs> LevelChanged;
        event EventHandler<WarpedEventArgs> Warped;
    }

    public interface ISpecializedEvents
    {
        event EventHandler<LoadStageChangedEventArgs> LoadStageChanged;
        event EventHandler<UnvalidatedUpdateTickingEventArgs> UnvalidatedUpdateTicking;
        event EventHandler<UnvalidatedUpdateTickedEventArgs> UnvalidatedUpdateTicked;
    }

    public interface IWorldEvents
    {
        event EventHandler<BuildingListChangedEventArgs> BuildingListChanged;
        event EventHandler<ChestInventoryChangedEventArgs> ChestInventoryChanged;
        event EventHandler<DebrisListChangedEventArgs> DebrisListChanged;
        event EventHandler<FurnitureListChangedEventArgs> FurnitureListChanged;
        event EventHandler<LargeTerrainFeatureListChangedEventArgs> LargeTerrainFeatureListChanged;
        event EventHandler<LocationListChangedEventArgs> LocationListChanged;
        event EventHandler<NpcListChangedEventArgs> NpcListChanged;
        event EventHandler<ObjectListChangedEventArgs> ObjectListChanged;
        event EventHandler<TerrainFeatureListChangedEventArgs> TerrainFeatureListChanged;
    }

    public sealed class GameLaunchedEventArgs : EventArgs
    {
    }

    public sealed class ReturnedToTitleEventArgs : EventArgs
    {
    }

    public sealed class SaveCreatedEventArgs : EventArgs { }
    public sealed class SaveCreatingEventArgs : EventArgs { }
    public sealed class SaveLoadedEventArgs : EventArgs { }
    public sealed class SavedEventArgs : EventArgs { }
    public sealed class SavingEventArgs : EventArgs { }
    public sealed class DayStartedEventArgs : EventArgs { }
    public sealed class DayEndingEventArgs : EventArgs { }
    public sealed class TimeChangedEventArgs : EventArgs { }
    public sealed class OneSecondUpdateTickingEventArgs : EventArgs { }
    public sealed class UpdateTickingEventArgs : EventArgs { }

    public sealed class UpdateTickedEventArgs : EventArgs
    {
    }

    public sealed class OneSecondUpdateTickedEventArgs : EventArgs
    {
    }

    public sealed class ButtonPressedEventArgs : EventArgs
    {
    }

    public sealed class ButtonsChangedEventArgs : EventArgs
    {
    }

    public sealed class ButtonReleasedEventArgs : EventArgs
    {
    }

    public sealed class CursorMovedEventArgs : EventArgs
    {
    }

    public sealed class MouseWheelScrolledEventArgs : EventArgs
    {
    }

    public sealed class AssetRequestedEventArgs : EventArgs { }
    public sealed class AssetsInvalidatedEventArgs : EventArgs { }
    public sealed class AssetReadyEventArgs : EventArgs { }
    public sealed class LocaleChangedEventArgs : EventArgs { }
    public sealed class MenuChangedEventArgs : EventArgs { }
    public sealed class RenderingEventArgs : EventArgs { }
    public sealed class RenderingStepEventArgs : EventArgs { }
    public sealed class RenderedEventArgs : EventArgs { }
    public sealed class RenderedStepEventArgs : EventArgs { }
    public sealed class RenderedActiveMenuEventArgs : EventArgs { }
    public sealed class RenderingHudEventArgs : EventArgs { }
    public sealed class RenderedHudEventArgs : EventArgs { }
    public sealed class RenderingWorldEventArgs : EventArgs { }
    public sealed class RenderedWorldEventArgs : EventArgs { }
    public sealed class WindowResizedEventArgs : EventArgs { }
    public sealed class ClientConnectedEventArgs : EventArgs { }
    public sealed class ClientDisconnectedEventArgs : EventArgs { }
    public sealed class ModMessageReceivedEventArgs : EventArgs { }
    public sealed class PeerContextReceivedEventArgs : EventArgs { }
    public sealed class PeerConnectedEventArgs : EventArgs { }
    public sealed class PeerDisconnectedEventArgs : EventArgs { }
    public sealed class InventoryChangedEventArgs : EventArgs { }
    public sealed class LevelChangedEventArgs : EventArgs { }
    public sealed class WarpedEventArgs : EventArgs { }
    public sealed class LoadStageChangedEventArgs : EventArgs { }
    public sealed class UnvalidatedUpdateTickingEventArgs : EventArgs { }
    public sealed class UnvalidatedUpdateTickedEventArgs : EventArgs { }
    public sealed class BuildingListChangedEventArgs : EventArgs { }
    public sealed class ChestInventoryChangedEventArgs : EventArgs { }
    public sealed class DebrisListChangedEventArgs : EventArgs { }
    public sealed class FurnitureListChangedEventArgs : EventArgs { }
    public sealed class LargeTerrainFeatureListChangedEventArgs : EventArgs { }
    public sealed class LocationListChangedEventArgs : EventArgs { }
    public sealed class NpcListChangedEventArgs : EventArgs { }
    public sealed class ObjectListChangedEventArgs : EventArgs { }
    public sealed class TerrainFeatureListChangedEventArgs : EventArgs { }
}
