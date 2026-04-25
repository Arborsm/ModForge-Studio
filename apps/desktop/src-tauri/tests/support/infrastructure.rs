#[allow(dead_code, unused_imports)]
#[path = "../../src/infrastructure/fs/pathing.rs"]
pub mod fs_pathing;
#[allow(dead_code, unused_imports)]
#[path = "../../src/infrastructure/game_formats/tbin.rs"]
pub mod game_formats_tbin;
#[allow(dead_code, unused_imports)]
#[path = "../../src/infrastructure/game_formats/xact/mod.rs"]
pub mod game_formats_xact;
#[allow(dead_code, unused_imports)]
#[path = "../../src/infrastructure/game_formats/xnb/mod.rs"]
pub mod game_formats_xnb;

#[allow(unused_imports)]
pub mod fs {
    pub use super::fs_pathing as pathing;
}

#[allow(unused_imports)]
pub mod game_formats {
    pub use super::game_formats_tbin as tbin;
    pub use super::game_formats_xact as xact;
    pub use super::game_formats_xnb as xnb;
}
