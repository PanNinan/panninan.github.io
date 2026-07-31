const fs = require('fs');
const path = require('path');
const { minify: htmlMinify } = require('html-minifier-terser');
const { minify: terserMinify } = require('terser');
const CleanCSS = require('clean-css');

// ========== 配置区 ==========
const SRC_DIR = './public';       // 源文件夹
const OUT_DIR = './public';      // 输出文件夹
const IGNORE_DIRS = ['node_modules', '.git', '.vscode', 'dist', '.idea'];
// ============================

const cleanCss = new CleanCSS({ level: 2 });

// 创建目录
function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// HTML压缩配置
const htmlOpts = {
    collapseWhitespace: true,
    collapseBooleanAttributes: true,
    removeComments: true,
    removeRedundantAttributes: true,
    useShortDoctype: true,
    minifyCSS: true,
    minifyJS: true,
    minifyURLs: true
};

async function processFile(srcPath, outPath, ext) {
    const raw = fs.readFileSync(srcPath, 'utf8');
    let result;

    try {
        if (ext === '.html') {
            result = await htmlMinify(raw, htmlOpts);
        } else if (ext === '.js') {
            const ret = await terserMinify(raw);
            result = ret.code;
        } else if (ext === '.css') {
            result = cleanCss.minify(raw).styles;
        }

        ensureDir(path.dirname(outPath));
        fs.writeFileSync(outPath, result, 'utf8');
        console.log(`✅ ${srcPath} → ${outPath}`);
    } catch (err) {
        console.error(`❌ 压缩失败 ${srcPath}:`, err.message);
        // 出错时原样复制文件（可选，注释掉则不输出）
        // fs.copyFileSync(srcPath, outPath);
    }
}

async function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
        const fullPath = path.join(dir, ent.name);
        const relPath = path.relative(SRC_DIR, fullPath);
        const outFullPath = path.join(OUT_DIR, relPath);

        if (ent.isDirectory()) {
            if (IGNORE_DIRS.includes(ent.name)) continue;
            ensureDir(outFullPath);
            await walk(fullPath);
        } else if (ent.isFile()) {
            const ext = path.extname(ent.name).toLowerCase();
            if (['.html', '.js', '.css'].includes(ext)) {
                await processFile(fullPath, outFullPath, ext);
            } else {
                // 非目标文件直接复制（图片、字体等）
                fs.copyFileSync(fullPath, outFullPath);
                console.log(`📄 复制 ${fullPath}`);
            }
        }
    }
}

(async function main() {
    if (!fs.existsSync(SRC_DIR)) {
        console.error(`源目录不存在：${SRC_DIR}`);
        return;
    }
    ensureDir(OUT_DIR);
    await walk(SRC_DIR);
    console.log('\n🎉 全部处理完成！');
})();