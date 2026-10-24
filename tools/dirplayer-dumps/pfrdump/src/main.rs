mod pfr1;
use pfr1::types::*;
fn main() {
    let path = std::env::args().nth(1).unwrap();
    let data = std::fs::read(path).unwrap();
    let px: i32 = std::env::args().nth(2).map(|s| s.parse().unwrap()).unwrap_or(0); let f = pfr1::parse_pfr1_font_with_target(&data, px).unwrap();
    let m = &f.physical_font;
    eprintln!("METRICS {:?}", m.metrics); println!("{{\"name\":{:?},\"orus\":{},\"glyphs\":{{", f.font_name, m.outline_resolution);
    let mut keys: Vec<_> = f.glyphs.keys().collect(); keys.sort();
    let mut first = true;
    for k in keys {
        let g = &f.glyphs[k];
        if !first { println!(","); } first = false;
        print!("\"{}\":{{\"w\":{},\"c\":[", k, g.set_width);
        for (ci, c) in g.contours.iter().enumerate() {
            if ci > 0 { print!(","); }
            print!("[");
            for (i, cmd) in c.commands.iter().enumerate() {
                if i > 0 { print!(","); }
                match cmd.cmd_type {
                    PfrCmdType::MoveTo => print!("[\"M\",{},{}]", cmd.x, cmd.y),
                    PfrCmdType::LineTo => print!("[\"L\",{},{}]", cmd.x, cmd.y),
                    PfrCmdType::CurveTo => print!("[\"C\",{},{},{},{},{},{}]", cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y),
                    PfrCmdType::Close => print!("[\"Z\"]"),
                }
            }
            print!("]");
        }
        print!("]}}");
    }
    println!("}}}}");
}
