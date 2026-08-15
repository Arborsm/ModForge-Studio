use super::MANIFEST_FILE_NAME;
use super::schema::object_value_case_insensitive;
use crate::domain::launcher::fs::read_json_file;
use crate::domain::launcher::types::{
    LauncherGmcmProbeDiagnosticStatus, LauncherGmcmProbeDiagnosticsResult,
};
use crate::infrastructure::fs::pathing::normalize_path;
use crate::support::logging::{LogEvent, targets};
use anyhow::{Context, bail};
use serde_json::Value;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Output, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

pub(crate) const GMCM_PROBE_OUTPUT_LIMIT: u64 = 4 * 1024 * 1024;
static GMCM_PROBE_TEMP_SEQUENCE: AtomicU64 = AtomicU64::new(0);

fn dotnet_executable_name() -> &'static str {
    if cfg!(windows) {
        "dotnet.exe"
    } else {
        "dotnet"
    }
}

pub(crate) fn resolve_dotnet_host_path(
    configured_path: Option<std::ffi::OsString>,
    search_path: Option<std::ffi::OsString>,
    home_dir: Option<PathBuf>,
) -> PathBuf {
    if let Some(path) = configured_path
        .map(PathBuf::from)
        .filter(|path| path.is_file())
    {
        return path;
    }

    let executable_name = dotnet_executable_name();
    if let Some(path) = search_path.as_deref().and_then(|paths| {
        std::env::split_paths(paths)
            .map(|root| root.join(executable_name))
            .find(|path| path.is_file())
    }) {
        return path;
    }

    let mut candidates = Vec::new();
    if let Some(home_dir) = home_dir {
        candidates.push(home_dir.join(".dotnet").join(executable_name));
    }
    if cfg!(target_os = "linux") {
        candidates.push(PathBuf::from("/usr/share/dotnet/dotnet"));
        candidates.push(PathBuf::from("/usr/local/share/dotnet/dotnet"));
        candidates.push(PathBuf::from("/snap/bin/dotnet"));
    }
    if cfg!(target_os = "macos") {
        candidates.push(PathBuf::from("/opt/homebrew/bin/dotnet"));
        candidates.push(PathBuf::from("/usr/local/bin/dotnet"));
        candidates.push(PathBuf::from("/usr/local/share/dotnet/dotnet"));
        candidates.push(PathBuf::from("/usr/local/share/dotnet/x64/dotnet"));
    }

    candidates
        .into_iter()
        .find(|path| path.is_file())
        .unwrap_or_else(|| PathBuf::from(executable_name))
}

fn dotnet_host_path() -> PathBuf {
    resolve_dotnet_host_path(
        std::env::var_os("MODFORGE_DOTNET_PATH"),
        std::env::var_os("PATH"),
        dirs::home_dir(),
    )
}

pub(crate) fn probe_assembly_path() -> Option<PathBuf> {
    std::env::var_os("MODFORGE_GMCM_PROBE_PATH")
        .map(PathBuf::from)
        .filter(|path| path.is_file())
        .or_else(|| {
            let exe_dir = std::env::current_exe()
                .ok()
                .and_then(|path| path.parent().map(Path::to_path_buf))?;
            let probe_file_name = "modforge-gmcm-probe.dll";
            [
                exe_dir.join(probe_file_name),
                exe_dir.join("gmcm-probe").join(probe_file_name),
                exe_dir
                    .parent()
                    .unwrap_or(&exe_dir)
                    .join("release")
                    .join("gmcm-probe")
                    .join(probe_file_name),
                exe_dir
                    .join("resources")
                    .join("gmcm-probe")
                    .join(probe_file_name),
                exe_dir.join("bin").join("gmcm-probe").join(probe_file_name),
            ]
            .into_iter()
            .find(|path| path.is_file())
        })
}

fn parse_dotnet_runtime_lines(stdout: &[u8]) -> Vec<String> {
    String::from_utf8_lossy(stdout)
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}

fn has_net6_runtime(runtimes: &[String]) -> bool {
    runtimes
        .iter()
        .any(|runtime| runtime.starts_with("Microsoft.NETCore.App 6."))
}

pub fn load_launcher_gmcm_probe_diagnostics() -> LauncherGmcmProbeDiagnosticsResult {
    let probe_assembly_path = probe_assembly_path();
    let dotnet_path = dotnet_host_path();
    let dotnet_output = Command::new(&dotnet_path).arg("--list-runtimes").output();
    let mut warnings = Vec::new();
    let mut repair_actions = Vec::new();

    if probe_assembly_path.is_none() {
        warnings.push("probe-assembly-missing".to_string());
        repair_actions.push("rebuild-or-reinstall-probe".to_string());
    }

    let (dotnet_available, installed_runtimes) = match dotnet_output {
        Ok(output) if output.status.success() => (true, parse_dotnet_runtime_lines(&output.stdout)),
        Ok(output) => {
            warnings.push("dotnet-runtime-list-failed".to_string());
            if !output.stderr.is_empty() {
                warnings.push(
                    String::from_utf8_lossy(&output.stderr)
                        .trim()
                        .chars()
                        .take(240)
                        .collect(),
                );
            }
            repair_actions.push("install-dotnet-6-runtime".to_string());
            (false, Vec::new())
        }
        Err(error) => {
            warnings.push("dotnet-host-missing".to_string());
            warnings.push(error.to_string());
            repair_actions.push("install-dotnet-6-runtime".to_string());
            repair_actions.push("set-modforge-dotnet-path".to_string());
            (false, Vec::new())
        }
    };

    let net6_runtime_available = has_net6_runtime(&installed_runtimes);
    if dotnet_available && !net6_runtime_available {
        warnings.push("net6-runtime-missing".to_string());
        repair_actions.push("install-dotnet-6-runtime".to_string());
    }

    let status = if probe_assembly_path.is_some() && dotnet_available && net6_runtime_available {
        LauncherGmcmProbeDiagnosticStatus::Ready
    } else if probe_assembly_path.is_some() || dotnet_available {
        LauncherGmcmProbeDiagnosticStatus::Warning
    } else {
        LauncherGmcmProbeDiagnosticStatus::Unavailable
    };

    let result = LauncherGmcmProbeDiagnosticsResult {
        status,
        probe_assembly_path: probe_assembly_path.map(|path| normalize_path(&path)),
        dotnet_path: normalize_path(&dotnet_path),
        dotnet_available,
        net6_runtime_available,
        installed_runtimes,
        warnings,
        repair_actions,
    };

    match result.status {
        // A healthy probe reports nothing actionable and is re-run whenever the
        // config panel opens, so it stays out of the default terminal.
        LauncherGmcmProbeDiagnosticStatus::Ready => LogEvent::new("gmcmProbe.diagnostics")
            .debug("status", &result.status)
            .optional("probeAssembly", result.probe_assembly_path.as_deref())
            .field("dotnetPath", &result.dotnet_path)
            .count("runtimes", result.installed_runtimes.len())
            .emit_debug(targets::LAUNCHER_GMCM_PROBE),
        LauncherGmcmProbeDiagnosticStatus::Warning
        | LauncherGmcmProbeDiagnosticStatus::Unavailable => LogEvent::new("gmcmProbe.diagnostics")
            .debug("status", &result.status)
            .optional("probeAssembly", result.probe_assembly_path.as_deref())
            .field("dotnetPath", &result.dotnet_path)
            .flag("dotnetAvailable", result.dotnet_available)
            .flag("net6RuntimeAvailable", result.net6_runtime_available)
            .count("runtimes", result.installed_runtimes.len())
            .field("warnings", result.warnings.join(","))
            .field("repairActions", result.repair_actions.join(","))
            .emit_warn(targets::LAUNCHER_GMCM_PROBE),
    }

    result
}

struct ProbeTempDirectory {
    path: PathBuf,
}

impl ProbeTempDirectory {
    fn create() -> anyhow::Result<Self> {
        let base = std::env::temp_dir();
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        for _ in 0..32 {
            let sequence = GMCM_PROBE_TEMP_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            let path = base.join(format!(
                "modforge-gmcm-probe-{}-{timestamp}-{sequence}",
                std::process::id()
            ));
            match fs::create_dir(&path) {
                Ok(()) => return Ok(Self { path }),
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
                Err(error) => {
                    return Err(error).with_context(|| {
                        format!(
                            "Failed to create GMCM probe temp directory {}",
                            normalize_path(&path)
                        )
                    });
                }
            }
        }
        bail!("Failed to allocate a unique GMCM probe temp directory after 32 attempts")
    }

    fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for ProbeTempDirectory {
    fn drop(&mut self) {
        for attempt in 0..4 {
            match fs::remove_dir_all(&self.path) {
                Ok(()) => return,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => return,
                Err(_) if attempt < 3 => thread::sleep(Duration::from_millis(10)),
                Err(_) => return,
            }
        }
    }
}

#[cfg(windows)]
mod probe_job {
    use anyhow::Context;
    use std::ffi::c_void;
    use std::os::windows::io::AsRawHandle;
    use std::process::Child;

    const JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS: i32 = 9;
    const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: u32 = 0x0000_2000;

    #[repr(C)]
    struct JobObjectBasicLimitInformation {
        per_process_user_time_limit: i64,
        per_job_user_time_limit: i64,
        limit_flags: u32,
        minimum_working_set_size: usize,
        maximum_working_set_size: usize,
        active_process_limit: u32,
        affinity: usize,
        priority_class: u32,
        scheduling_class: u32,
    }

    #[repr(C)]
    struct IoCounters {
        read_operation_count: u64,
        write_operation_count: u64,
        other_operation_count: u64,
        read_transfer_count: u64,
        write_transfer_count: u64,
        other_transfer_count: u64,
    }

    #[repr(C)]
    struct JobObjectExtendedLimitInformation {
        basic_limit_information: JobObjectBasicLimitInformation,
        io_info: IoCounters,
        process_memory_limit: usize,
        job_memory_limit: usize,
        peak_process_memory_used: usize,
        peak_job_memory_used: usize,
    }

    #[link(name = "kernel32")]
    unsafe extern "system" {
        #[link_name = "CreateJobObjectW"]
        fn create_job_object_w(attributes: *const c_void, name: *const u16) -> *mut c_void;
        #[link_name = "SetInformationJobObject"]
        fn set_information_job_object(
            job: *mut c_void,
            information_class: i32,
            information: *const c_void,
            information_length: u32,
        ) -> i32;
        #[link_name = "AssignProcessToJobObject"]
        fn assign_process_to_job_object(job: *mut c_void, process: *mut c_void) -> i32;
        #[link_name = "TerminateJobObject"]
        fn terminate_job_object(job: *mut c_void, exit_code: u32) -> i32;
        #[link_name = "WaitForSingleObject"]
        fn wait_for_single_object(handle: *mut c_void, milliseconds: u32) -> u32;
        #[link_name = "CloseHandle"]
        fn close_handle(handle: *mut c_void) -> i32;
    }

    const WAIT_FOR_PROCESSES_TIMEOUT_MS: u32 = 5_000;

    pub(super) struct ProbeJob {
        handle: *mut c_void,
    }

    impl ProbeJob {
        pub(super) fn new() -> anyhow::Result<Self> {
            let handle = unsafe { create_job_object_w(std::ptr::null(), std::ptr::null()) };
            if handle.is_null() {
                return Err(std::io::Error::last_os_error())
                    .context("Failed to create GMCM probe Windows Job Object");
            }

            let mut information: JobObjectExtendedLimitInformation = unsafe { std::mem::zeroed() };
            information.basic_limit_information.limit_flags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let configured = unsafe {
                set_information_job_object(
                    handle,
                    JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS,
                    std::ptr::from_ref(&information).cast(),
                    std::mem::size_of::<JobObjectExtendedLimitInformation>() as u32,
                )
            };
            if configured == 0 {
                let error = std::io::Error::last_os_error();
                unsafe {
                    close_handle(handle);
                }
                return Err(error).context("Failed to configure GMCM probe Windows Job Object");
            }

            Ok(Self { handle })
        }

        pub(super) fn assign(&self, child: &Child) -> anyhow::Result<()> {
            let assigned =
                unsafe { assign_process_to_job_object(self.handle, child.as_raw_handle().cast()) };
            if assigned == 0 {
                return Err(std::io::Error::last_os_error())
                    .context("Failed to assign GMCM probe to Windows Job Object");
            }
            Ok(())
        }

        pub(super) fn terminate(&self) {
            unsafe {
                terminate_job_object(self.handle, 1);
            }
            // TerminateJobObject starts termination asynchronously. Wait until the job is
            // signaled so its processes no longer hold the probe working directory.
            unsafe {
                let _ = wait_for_single_object(self.handle, WAIT_FOR_PROCESSES_TIMEOUT_MS);
            }
        }
    }

    impl Drop for ProbeJob {
        fn drop(&mut self) {
            unsafe {
                close_handle(self.handle);
            }
        }
    }
}

#[cfg(unix)]
unsafe extern "C" {
    #[link_name = "kill"]
    fn libc_kill(process_id: i32, signal: i32) -> i32;
}

struct ProbeProcessOwner {
    #[cfg(windows)]
    job: probe_job::ProbeJob,
    #[cfg(unix)]
    process_group_id: Option<i32>,
    terminated: bool,
}

impl ProbeProcessOwner {
    fn new() -> anyhow::Result<Self> {
        Ok(Self {
            #[cfg(windows)]
            job: probe_job::ProbeJob::new()?,
            #[cfg(unix)]
            process_group_id: None,
            terminated: false,
        })
    }

    fn attach(&mut self, child: &Child) -> anyhow::Result<()> {
        #[cfg(windows)]
        self.job.assign(child)?;
        #[cfg(unix)]
        {
            self.process_group_id =
                Some(i32::try_from(child.id()).context("GMCM probe process ID exceeded i32")?);
        }
        #[cfg(not(any(windows, unix)))]
        let _ = child;
        Ok(())
    }

    fn terminate_owned_processes(&self) {
        #[cfg(windows)]
        self.job.terminate();
        #[cfg(unix)]
        if let Some(process_group_id) = self.process_group_id {
            unsafe {
                libc_kill(-process_group_id, 9);
            }
        }
    }

    fn terminate_and_wait(&mut self, child: &mut Child) {
        if !self.terminated {
            self.terminate_owned_processes();
        }
        let _ = child.kill();
        let _ = child.wait();
        self.terminated = true;
    }
}

impl Drop for ProbeProcessOwner {
    fn drop(&mut self) {
        if !self.terminated {
            self.terminate_owned_processes();
        }
    }
}

fn ensure_probe_output_within_limit(
    mode: &str,
    stdout_path: &Path,
    stderr_path: &Path,
) -> anyhow::Result<()> {
    let stdout_size = fs::metadata(stdout_path)
        .with_context(|| {
            format!(
                "Failed to inspect GMCM probe output {}",
                normalize_path(stdout_path)
            )
        })?
        .len();
    let stderr_size = fs::metadata(stderr_path)
        .with_context(|| {
            format!(
                "Failed to inspect GMCM probe output {}",
                normalize_path(stderr_path)
            )
        })?
        .len();
    if stdout_size > GMCM_PROBE_OUTPUT_LIMIT || stderr_size > GMCM_PROBE_OUTPUT_LIMIT {
        bail!(
            "GMCM {mode} probe output exceeded the {}-byte per-stream limit (stdout={stdout_size}, stderr={stderr_size}).",
            GMCM_PROBE_OUTPUT_LIMIT
        );
    }
    Ok(())
}

pub(crate) fn run_probe_with_timeout(
    probe_assembly_path: &Path,
    root: &Path,
    game_path: Option<&Path>,
    mode: &str,
    child_timeout: Duration,
    parent_timeout: Duration,
) -> anyhow::Result<Option<Output>> {
    let temp_dir = ProbeTempDirectory::create()?;
    let stdout_path = temp_dir.path().join("stdout.json");
    let stderr_path = temp_dir.path().join("stderr.log");
    let stdout_file = fs::File::create(&stdout_path).with_context(|| {
        format!(
            "Failed to create GMCM probe stdout file {}",
            normalize_path(&stdout_path)
        )
    })?;
    let stderr_file = fs::File::create(&stderr_path).with_context(|| {
        format!(
            "Failed to create GMCM probe stderr file {}",
            normalize_path(&stderr_path)
        )
    })?;
    let dotnet_path = dotnet_host_path();
    let mut command = Command::new(&dotnet_path);
    command
        .arg(probe_assembly_path)
        .arg("--mod-path")
        .arg(root)
        .arg("--mode")
        .arg(mode)
        .arg("--timeout-ms")
        .arg(child_timeout.as_millis().to_string())
        .current_dir(temp_dir.path())
        .stdout(Stdio::from(stdout_file))
        .stderr(Stdio::from(stderr_file));
    if let Some(game_path) = game_path {
        command.arg("--game-path").arg(game_path);
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let mut process_owner = ProbeProcessOwner::new()?;
    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => {
            return Err(error).with_context(|| {
                format!(
                    "Failed to start GMCM probe {} with dotnet host {}",
                    normalize_path(probe_assembly_path),
                    normalize_path(&dotnet_path)
                )
            });
        }
    };
    if let Err(error) = process_owner.attach(&child) {
        let _ = child.kill();
        let _ = child.wait();
        return Err(error);
    }
    let started_at = Instant::now();
    loop {
        let status = match child.try_wait() {
            Ok(status) => status,
            Err(error) => {
                process_owner.terminate_and_wait(&mut child);
                return Err(error).context("Failed to poll GMCM probe process");
            }
        };
        if let Err(error) = ensure_probe_output_within_limit(mode, &stdout_path, &stderr_path) {
            process_owner.terminate_and_wait(&mut child);
            return Err(error);
        }
        if let Some(status) = status {
            // The root process may exit while a mod-created descendant remains alive.
            // Terminate the owned job/process group before reading or deleting its output files.
            process_owner.terminate_and_wait(&mut child);
            ensure_probe_output_within_limit(mode, &stdout_path, &stderr_path)?;
            let stdout = read_probe_output_file(&stdout_path);
            let stderr = read_probe_output_file(&stderr_path);
            return match (stdout, stderr) {
                (Ok(stdout), Ok(stderr)) => Ok(Some(Output {
                    status,
                    stdout,
                    stderr,
                })),
                (Err(error), _) | (_, Err(error)) => Err(error),
            };
        }
        if started_at.elapsed() >= parent_timeout {
            process_owner.terminate_and_wait(&mut child);
            return Ok(None);
        }
        thread::sleep(Duration::from_millis(10));
    }
}

fn read_probe_output_file(path: &Path) -> anyhow::Result<Vec<u8>> {
    let file = fs::File::open(path)
        .with_context(|| format!("Failed to open GMCM probe output {}", normalize_path(path)))?;
    let mut output = Vec::new();
    file.take(GMCM_PROBE_OUTPUT_LIMIT.saturating_add(1))
        .read_to_end(&mut output)
        .with_context(|| format!("Failed to read GMCM probe output {}", normalize_path(path)))?;
    if output.len() as u64 > GMCM_PROBE_OUTPUT_LIMIT {
        bail!(
            "GMCM probe output {} exceeded the {}-byte limit.",
            normalize_path(path),
            GMCM_PROBE_OUTPUT_LIMIT
        );
    }
    Ok(output)
}

fn manifest_entry_dll(root: &Path) -> Option<PathBuf> {
    let Value::Object(manifest) = read_json_file(&root.join(MANIFEST_FILE_NAME)).ok()? else {
        return None;
    };
    let relative = object_value_case_insensitive(&manifest, "EntryDll")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())?;
    let relative = Path::new(relative);
    if relative.is_absolute() {
        return None;
    }
    let candidate = root.join(relative).canonicalize().ok()?;
    (candidate.starts_with(root)
        && candidate.is_file()
        && candidate
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("dll")))
    .then_some(candidate)
}

pub(crate) fn mod_has_probe_dll(root: &Path) -> bool {
    if manifest_entry_dll(root).is_some() {
        return true;
    }
    root.read_dir()
        .map(|entries| {
            entries.filter_map(Result::ok).any(|entry| {
                entry
                    .path()
                    .extension()
                    .and_then(|value| value.to_str())
                    .is_some_and(|extension| extension.eq_ignore_ascii_case("dll"))
            })
        })
        .unwrap_or(false)
}
