#[macro_export]
macro_rules! host_command_wire {
    ($command:ident) => {
        stringify!($command)
    };
}
