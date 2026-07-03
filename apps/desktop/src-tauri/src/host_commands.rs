use std::borrow::Cow;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct HostCommandName(Cow<'static, str>);

impl HostCommandName {
    pub const fn from_static(value: &'static str) -> Self {
        Self(Cow::Borrowed(value))
    }

    pub fn from_protocol(value: String) -> Self {
        Self(Cow::Owned(value))
    }

    pub fn as_str(&self) -> &str {
        self.0.as_ref()
    }
}

#[macro_export]
macro_rules! host_command_name {
    ($command:ident) => {
        $crate::host_commands::HostCommandName::from_static(stringify!($command))
    };
}

#[macro_export]
macro_rules! host_command_wire {
    ($command:ident) => {
        stringify!($command)
    };
}
