use serde::Serialize;

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Status {
    Idle,
    Running,
    Paused,
    Finished,
}

/// Immutable view of the countdown, sent to the UI on every tick.
#[derive(Serialize, Clone, Copy, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub total: f64,
    pub elapsed: f64,
    pub remaining: f64,
    pub status: Status,
    pub loop_mode: bool,
    pub rounds: u32,
}

#[derive(Clone, Copy, Debug)]
pub enum RoundEnd {
    Finished,
    Looped,
}

#[derive(Debug)]
pub struct Timer {
    pub total: f64,
    pub elapsed: f64,
    pub status: Status,
    pub loop_mode: bool,
    pub rounds: u32,
}

impl Timer {
    pub fn new(total: f64) -> Self {
        Self {
            total: total.max(0.0),
            elapsed: 0.0,
            status: Status::Idle,
            loop_mode: false,
            rounds: 0,
        }
    }

    pub fn snapshot(&self) -> Snapshot {
        Snapshot {
            total: self.total,
            elapsed: self.elapsed,
            remaining: (self.total - self.elapsed).max(0.0),
            status: self.status,
            loop_mode: self.loop_mode,
            rounds: self.rounds,
        }
    }

    /// Advances the clock by `dt` seconds and reports whether a round ended.
    pub fn advance(&mut self, dt: f64) -> Option<RoundEnd> {
        if self.status != Status::Running {
            return None;
        }
        self.elapsed += dt;
        if self.elapsed < self.total {
            return None;
        }
        if self.loop_mode {
            self.rounds += 1;
            self.elapsed = (self.elapsed - self.total).max(0.0);
            if self.elapsed >= self.total {
                self.elapsed = 0.0;
            }
            Some(RoundEnd::Looped)
        } else {
            self.elapsed = self.total;
            self.status = Status::Finished;
            Some(RoundEnd::Finished)
        }
    }
}
