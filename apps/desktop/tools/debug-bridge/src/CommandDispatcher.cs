using StardewModdingAPI;
using StardewValley;
using StardewValley.Logging;

namespace ModForge.DebugBridge;

/// <summary>Executes bridge commands on the game's update thread.</summary>
public sealed class CommandDispatcher
{
    private static readonly string[] WeatherIds = { "Sun", "Rain", "GreenRain", "Wind", "Storm", "Snow", "Festival" };

    private readonly IModHelper helper;
    private readonly IManifest manifest;
    private readonly TempAssetPatcher tempPatcher;
    private readonly IMonitor monitor;

    public CommandDispatcher(IModHelper helper, IManifest manifest, IMonitor monitor, TempAssetPatcher tempPatcher)
    {
        this.helper = helper;
        this.manifest = manifest;
        this.monitor = monitor;
        this.tempPatcher = tempPatcher;
    }

    public BridgeResponse Execute(BridgeRequest request)
    {
        try
        {
            return request.Command switch
            {
                "hello" => this.Hello(request),
                "state" => this.State(request),
                "warp" => this.Warp(request),
                "set-time" => this.SetTime(request),
                "add-money" => this.AddMoney(request),
                "set-stamina" => this.SetStamina(request),
                "set-health" => this.SetHealth(request),
                "set-friendship" => this.SetFriendship(request),
                "set-weather-tomorrow" => this.SetWeatherTomorrow(request),
                "speech" => this.Speech(request),
                "play-event-id" => this.PlayEventById(request),
                "run-event-script" => this.RunEventScript(request),
                "set-temp-entry" => this.SetTempEntry(request),
                "remove-temp-entry" => this.RemoveTempEntry(request),
                "clear-temp-entries" => this.ClearTempEntries(request),
                "list-temp-entries" => this.ListTempEntries(request),
                "debug" => this.RunDebugCommand(request),
                _ => BridgeResponse.Failure(request.Id, $"Unknown command '{request.Command}'.")
            };
        }
        catch (Exception ex)
        {
            this.monitor.Log($"Bridge command '{request.Command}' failed: {ex}", LogLevel.Warn);
            return BridgeResponse.Failure(request.Id, ex.Message);
        }
    }

    private BridgeResponse Hello(BridgeRequest request)
    {
        return BridgeResponse.Success(request.Id, new
        {
            bridgeVersion = this.manifest.Version.ToString(),
            gameVersion = Game1.version,
            smapiVersion = Constants.ApiVersion.ToString(),
            saveLoaded = Context.IsWorldReady
        });
    }

    private BridgeResponse State(BridgeRequest request)
    {
        if (!Context.IsWorldReady)
            return BridgeResponse.Success(request.Id, new { saveLoaded = false });

        Farmer player = Game1.player;
        GameLocation? location = Game1.currentLocation;
        return BridgeResponse.Success(request.Id, new
        {
            saveLoaded = true,
            playerName = player.Name,
            farmName = player.farmName.Value,
            money = player.Money,
            stamina = (int)player.stamina,
            maxStamina = player.MaxStamina,
            health = player.health,
            maxHealth = player.maxHealth,
            location = location?.NameOrUniqueName,
            tileX = (int)player.Tile.X,
            tileY = (int)player.Tile.Y,
            facingDirection = player.FacingDirection,
            day = Game1.dayOfMonth,
            season = Game1.currentSeason,
            year = Game1.year,
            timeOfDay = Game1.timeOfDay,
            dayOfWeek = Game1.shortDayNameFromDayOfSeason(Game1.dayOfMonth),
            weather = Game1.isRaining ? (Game1.isLightning ? "Storm" : "Rain") : Game1.isSnowing ? "Snow" : Game1.isDebrisWeather ? "Wind" : "Sun",
            weatherForTomorrow = Game1.weatherForTomorrow,
            eventUp = Game1.eventUp,
            currentEventId = location?.currentEvent?.id
        });
    }

    private static BridgeResponse RequireWorld(BridgeRequest request)
        => BridgeResponse.Failure(request.Id, "No save is loaded — load a save first.");

    private BridgeResponse Warp(BridgeRequest request)
    {
        if (!Context.IsWorldReady)
            return RequireWorld(request);
        string? location = request.GetString("location");
        int? x = request.GetInt("x");
        int? y = request.GetInt("y");
        if (location is null || x is null || y is null)
            return BridgeResponse.Failure(request.Id, "warp requires location, x, and y.");
        if (Game1.getLocationFromName(location) is null)
            return BridgeResponse.Failure(request.Id, $"Unknown location '{location}'.");
        Game1.warpFarmer(location, x.Value, y.Value, flip: false);
        return BridgeResponse.Success(request.Id, null);
    }

    private BridgeResponse SetTime(BridgeRequest request)
    {
        if (!Context.IsWorldReady)
            return RequireWorld(request);
        int? time = request.GetInt("time");
        if (time is null || time < 600 || time > 2600 || time % 100 >= 60)
            return BridgeResponse.Failure(request.Id, "set-time requires a time between 600 and 2600 with minutes below 60.");
        Game1.timeOfDay = time.Value;
        return BridgeResponse.Success(request.Id, new { timeOfDay = Game1.timeOfDay });
    }

    private BridgeResponse AddMoney(BridgeRequest request)
    {
        if (!Context.IsWorldReady)
            return RequireWorld(request);
        int? amount = request.GetInt("amount");
        if (amount is null)
            return BridgeResponse.Failure(request.Id, "add-money requires amount.");
        Game1.player.Money = Math.Max(0, Game1.player.Money + amount.Value);
        return BridgeResponse.Success(request.Id, new { money = Game1.player.Money });
    }

    private BridgeResponse SetStamina(BridgeRequest request)
    {
        if (!Context.IsWorldReady)
            return RequireWorld(request);
        int? value = request.GetInt("value");
        if (value is null)
            return BridgeResponse.Failure(request.Id, "set-stamina requires value.");
        Game1.player.stamina = Math.Clamp(value.Value, 0, Game1.player.MaxStamina);
        return BridgeResponse.Success(request.Id, new { stamina = (int)Game1.player.stamina });
    }

    private BridgeResponse SetHealth(BridgeRequest request)
    {
        if (!Context.IsWorldReady)
            return RequireWorld(request);
        int? value = request.GetInt("value");
        if (value is null)
            return BridgeResponse.Failure(request.Id, "set-health requires value.");
        Game1.player.health = Math.Clamp(value.Value, 0, Game1.player.maxHealth);
        return BridgeResponse.Success(request.Id, new { health = Game1.player.health });
    }

    private BridgeResponse SetFriendship(BridgeRequest request)
    {
        if (!Context.IsWorldReady)
            return RequireWorld(request);
        string? npcName = request.GetString("npc");
        int? points = request.GetInt("points");
        if (npcName is null || points is null)
            return BridgeResponse.Failure(request.Id, "set-friendship requires npc and points.");
        if (Game1.getCharacterFromName(npcName) is null)
            return BridgeResponse.Failure(request.Id, $"Unknown NPC '{npcName}'.");
        if (!Game1.player.friendshipData.TryGetValue(npcName, out Friendship friendship))
        {
            friendship = new Friendship(0);
            Game1.player.friendshipData[npcName] = friendship;
        }
        friendship.Points = Math.Max(0, points.Value);
        return BridgeResponse.Success(request.Id, new { npc = npcName, points = friendship.Points });
    }

    private BridgeResponse SetWeatherTomorrow(BridgeRequest request)
    {
        if (!Context.IsWorldReady)
            return RequireWorld(request);
        string? weather = request.GetString("weather");
        if (weather is null || !WeatherIds.Contains(weather, StringComparer.OrdinalIgnoreCase))
            return BridgeResponse.Failure(request.Id, $"set-weather-tomorrow requires weather in [{string.Join(", ", WeatherIds)}].");
        Game1.weatherForTomorrow = WeatherIds.First(id => id.Equals(weather, StringComparison.OrdinalIgnoreCase));
        return BridgeResponse.Success(request.Id, new { weatherForTomorrow = Game1.weatherForTomorrow });
    }

    private BridgeResponse Speech(BridgeRequest request)
    {
        if (!Context.IsWorldReady)
            return RequireWorld(request);
        string? npcName = request.GetString("npc");
        string? text = request.GetString("text");
        if (npcName is null || string.IsNullOrWhiteSpace(text))
            return BridgeResponse.Failure(request.Id, "speech requires npc and text.");
        NPC? npc = Game1.getCharacterFromName(npcName);
        if (npc is null)
            return BridgeResponse.Failure(request.Id, $"Unknown NPC '{npcName}'.");
        Game1.DrawDialogue(new Dialogue(npc, translationKey: null, dialogueText: text));
        return BridgeResponse.Success(request.Id, null);
    }

    private BridgeResponse PlayEventById(BridgeRequest request)
    {
        if (!Context.IsWorldReady)
            return RequireWorld(request);
        string? eventId = request.GetString("eventId");
        if (eventId is null)
            return BridgeResponse.Failure(request.Id, "play-event-id requires eventId.");
        bool checkPreconditions = request.GetBool("checkPreconditions", fallback: false);
        bool checkSeen = request.GetBool("checkSeen", fallback: false);
        bool started = Game1.PlayEvent(eventId, checkPreconditions, checkSeen);
        if (!started)
            return BridgeResponse.Failure(request.Id, $"Event '{eventId}' was not found in any location's event data.");
        return BridgeResponse.Success(request.Id, null);
    }

    private BridgeResponse RunEventScript(BridgeRequest request)
    {
        if (!Context.IsWorldReady)
            return RequireWorld(request);
        if (Game1.eventUp)
            return BridgeResponse.Failure(request.Id, "An event is already running — finish it first.");
        string? script = request.GetString("script");
        if (string.IsNullOrWhiteSpace(script))
            return BridgeResponse.Failure(request.Id, "run-event-script requires script.");
        string eventId = request.GetString("eventId") ?? "ModForgeDebugEvent";
        string? locationName = request.GetString("location");

        GameLocation location = Game1.currentLocation;
        if (locationName is not null)
        {
            GameLocation? target = Game1.getLocationFromName(locationName);
            if (target is null)
                return BridgeResponse.Failure(request.Id, $"Unknown location '{locationName}'.");
            if (!ReferenceEquals(target, Game1.currentLocation))
            {
                Game1.warpFarmer(locationName, 0, 0, flip: false);
                return BridgeResponse.Failure(request.Id, $"Warped to '{locationName}' — the location must finish loading; run the event again once there.");
            }
            location = target;
        }

        location.startEvent(new Event(script, fromAssetName: null, eventID: eventId));
        return BridgeResponse.Success(request.Id, new { eventId, location = location.NameOrUniqueName });
    }

    private BridgeResponse SetTempEntry(BridgeRequest request)
    {
        string? target = request.GetString("target");
        string? key = request.GetString("key");
        string? value = request.GetString("value");
        if (target is null || key is null || value is null)
            return BridgeResponse.Failure(request.Id, "set-temp-entry requires target, key, and value.");
        this.tempPatcher.SetEntry(target, key, value);
        return BridgeResponse.Success(request.Id, new { target, key });
    }

    private BridgeResponse RemoveTempEntry(BridgeRequest request)
    {
        string? target = request.GetString("target");
        if (target is null)
            return BridgeResponse.Failure(request.Id, "remove-temp-entry requires target.");
        this.tempPatcher.RemoveEntries(target, request.GetString("key"));
        return BridgeResponse.Success(request.Id, null);
    }

    private BridgeResponse ClearTempEntries(BridgeRequest request)
    {
        this.tempPatcher.Clear();
        return BridgeResponse.Success(request.Id, null);
    }

    private BridgeResponse ListTempEntries(BridgeRequest request)
    {
        return BridgeResponse.Success(request.Id, new { entries = this.tempPatcher.List() });
    }

    private BridgeResponse RunDebugCommand(BridgeRequest request)
    {
        if (!Context.IsWorldReady)
            return RequireWorld(request);
        string? text = request.GetString("text");
        if (string.IsNullOrWhiteSpace(text))
            return BridgeResponse.Failure(request.Id, "debug requires text.");

        CapturingGameLogger logger = new();
        bool handled = DebugCommands.TryHandle(ArgUtility.SplitBySpaceQuoteAware(text), logger);
        return BridgeResponse.Success(request.Id, new { handled, output = logger.Lines });
    }

    /// <summary>Captures game-logger output produced by a debug command so it can be returned to the studio.</summary>
    private sealed class CapturingGameLogger : IGameLogger
    {
        public List<string> Lines { get; } = new();

        public void Verbose(string message) => this.Lines.Add(message);

        public void Debug(string message) => this.Lines.Add(message);

        public void Info(string message) => this.Lines.Add(message);

        public void Warn(string message) => this.Lines.Add(message);

        public void Error(string error, Exception? exception = null)
            => this.Lines.Add(exception is null ? error : $"{error} ({exception.Message})");
    }
}
