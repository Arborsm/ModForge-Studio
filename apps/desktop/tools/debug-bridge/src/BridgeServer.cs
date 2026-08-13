using System.Collections.Concurrent;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;

namespace ModForge.DebugBridge;

/// <summary>A queued request waiting for execution on the game's update thread.</summary>
public sealed class BridgeJob
{
    public BridgeJob(BridgeRequest request)
    {
        this.Request = request;
    }

    public BridgeRequest Request { get; }

    public TaskCompletionSource<BridgeResponse> Completion { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
}

/// <summary>Localhost TCP server speaking newline-delimited JSON. Requests are queued and executed on the game thread.</summary>
public sealed class BridgeServer : IDisposable
{
    private readonly int port;
    private readonly Action<string> logInfo;
    private readonly Action<string> logError;
    private TcpListener? listener;
    private Thread? acceptThread;
    private volatile bool disposed;

    /// <summary>Jobs pending execution on the game update thread.</summary>
    public ConcurrentQueue<BridgeJob> PendingJobs { get; } = new();

    public BridgeServer(int port, Action<string> logInfo, Action<string> logError)
    {
        this.port = port;
        this.logInfo = logInfo;
        this.logError = logError;
    }

    public void Start()
    {
        this.listener = new TcpListener(IPAddress.Loopback, this.port);
        this.listener.Start();
        this.acceptThread = new Thread(this.AcceptLoop)
        {
            IsBackground = true,
            Name = "ModForge.DebugBridge.Accept"
        };
        this.acceptThread.Start();
        this.logInfo($"Debug bridge listening on 127.0.0.1:{this.port}.");
    }

    private void AcceptLoop()
    {
        while (!this.disposed)
        {
            TcpClient client;
            try
            {
                client = this.listener!.AcceptTcpClient();
            }
            catch (SocketException)
            {
                break; // listener stopped
            }
            catch (ObjectDisposedException)
            {
                break;
            }

            Thread clientThread = new(() => this.ServeClient(client))
            {
                IsBackground = true,
                Name = "ModForge.DebugBridge.Client"
            };
            clientThread.Start();
        }
    }

    private void ServeClient(TcpClient client)
    {
        try
        {
            using (client)
            {
                client.ReceiveTimeout = 30_000;
                client.SendTimeout = 10_000;
                using NetworkStream stream = client.GetStream();
                using StreamReader reader = new(stream, Encoding.UTF8);
                using StreamWriter writer = new(stream, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false)) { AutoFlush = true };

                while (!this.disposed)
                {
                    string? line = reader.ReadLine();
                    if (line is null)
                        break;
                    if (string.IsNullOrWhiteSpace(line))
                        continue;

                    BridgeResponse response = this.HandleLine(line);
                    writer.WriteLine(JsonSerializer.Serialize(response, BridgeJson.Options));
                }
            }
        }
        catch (IOException)
        {
            // client disconnected mid-stream; nothing to clean up beyond the using blocks
        }
        catch (Exception ex)
        {
            this.logError($"Debug bridge client failed: {ex}");
        }
    }

    private BridgeResponse HandleLine(string line)
    {
        BridgeRequest? request;
        try
        {
            request = JsonSerializer.Deserialize<BridgeRequest>(line, BridgeJson.Options);
        }
        catch (JsonException ex)
        {
            return BridgeResponse.Failure(0, $"Invalid request JSON: {ex.Message}");
        }

        if (request is null || string.IsNullOrWhiteSpace(request.Command))
            return BridgeResponse.Failure(request?.Id ?? 0, "Request is missing a command.");

        BridgeJob job = new(request);
        this.PendingJobs.Enqueue(job);

        try
        {
            if (job.Completion.Task.Wait(TimeSpan.FromSeconds(8)))
                return job.Completion.Task.Result;
            return BridgeResponse.Failure(request.Id, "The game did not process the command in time (is it paused on the title screen?).");
        }
        catch (AggregateException ex)
        {
            return BridgeResponse.Failure(request.Id, ex.InnerException?.Message ?? ex.Message);
        }
    }

    public void Dispose()
    {
        this.disposed = true;
        try
        {
            this.listener?.Stop();
        }
        catch
        {
            // listener already stopped
        }
        while (this.PendingJobs.TryDequeue(out BridgeJob? job))
            job.Completion.TrySetResult(BridgeResponse.Failure(job.Request.Id, "Bridge shut down."));
    }
}
