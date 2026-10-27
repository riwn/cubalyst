-- ジャイロ（キューブの向き）の生データと、そこから計算した持ち替え。どちらもジャイロの無いソルブでは空文字列。
ALTER TABLE solves ADD COLUMN gyro  TEXT NOT NULL DEFAULT '';  -- JSON: [[t, w, x, y, z], ...]（t はソルブ開始からの相対ms）
ALTER TABLE solves ADD COLUMN holds TEXT NOT NULL DEFAULT '';  -- JSON: {"start":{"bottom","front"},"changes":[...]}（gyro からの派生データ）
