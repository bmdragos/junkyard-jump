#![allow(dead_code, unused)]
mod xmedia_styled_text;
pub mod io { pub mod encoding {
    pub fn decode_text_auto(b: &[u8]) -> String { match std::str::from_utf8(b) { Ok(s) => s.to_owned(), Err(_) => b.iter().map(|&c| c as char).collect() } }
}}
pub mod player { pub mod handlers { pub mod datum_handlers { pub mod cast_member { pub mod font {
    #[derive(Debug, Clone, Default)]
    pub struct HtmlStyle { pub font_face: Option<String>, pub font_size: Option<i32>, pub color: Option<u32>, pub bg_color: Option<u32>,
        pub bold: bool, pub italic: bool, pub underline: bool, pub kerning: i32, pub char_spacing: i32, pub hyperlink: Option<String> }
    #[derive(Debug, Clone)]
    pub struct StyledSpan { pub text: String, pub style: HtmlStyle }
    #[derive(Debug, Clone, Copy)]
    pub enum TextAlignment { Left, Center, Right, Justify }
}}}}}
fn esc(s: &str) -> String { s.replace('\\', "\\\\").replace('"', "\\\"").replace('\r', "\\r").replace('\n', "\\n") }
fn main() {
    print!("{{");
    let mut first = true;
    for p in std::env::args().skip(1) {
        let d = std::fs::read(&p).unwrap();
        let name = std::path::Path::new(&p).file_stem().unwrap().to_string_lossy().to_string();
        if let Ok(t) = xmedia_styled_text::parse_xmed(&d) {
            if !first { print!(","); } first = false;
            print!("\n\"{}\":{{\"text\":\"{}\",\"align\":\"{:?}\",\"wrap\":{},\"fixedLineSpace\":{},\"pageHeight\":{},\"spans\":[", name, esc(&t.text), t.alignment, t.word_wrap, t.fixed_line_space, t.page_height);
            for (i, s) in t.styled_spans.iter().enumerate() {
                if i > 0 { print!(","); }
                print!("{{\"text\":\"{}\",\"font\":\"{}\",\"size\":{},\"color\":{},\"bold\":{}}}", esc(&s.text), esc(s.style.font_face.as_deref().unwrap_or("")), s.style.font_size.unwrap_or(0), s.style.color.unwrap_or(0), s.style.bold);
            }
            print!("]}}");
        }
    }
    println!("\n}}");
}
