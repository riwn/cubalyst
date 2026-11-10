-- V perm の図（pattern）を、標準手順でそのまま揃う向きに直す。
-- 途中に y がある手順の形を、向きを戻さないまま作っていたため、1つ回した向きになっていた。
-- 0004_cases.sql も同じ値に直してあるので、新しく作った DB では何も変わらない。
UPDATE cases
SET pattern = 'UUUUUUUUULBRRRRRRRFFBFFFFFFDDDDDDDDDRLLLLLLLLBRFBBBBBB'
WHERE id = 'pll-V';
