const fs = require('fs');
const path = require('path');
const { minify: htmlMinify } = require('html-minifier-terser');
const { minify: terserMinify } = require('terser');
const CleanCSS = require('clean-css');

// ========== 配置区 ==========
// 压缩对象：public 目录下的 html/css/js（其余文件原样复制）
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
        console.log(`✅ ${path.relative(process.cwd(), srcPath)}`);
    } catch (err) {
        console.error(`❌ 压缩失败 ${srcPath}:`, err.message);
        // 出错时原样复制文件（避免博文丢失）
        try { fs.copyFileSync(srcPath, outPath); } catch (e) { /* ignore */ }
    }
}

// 递归遍历：base 为顶层根目录（同时作为输出根，原地压缩）
async function walk(currentDir, base) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const ent of entries) {
        const fullPath = path.join(currentDir, ent.name);
        const relPath = path.relative(base, fullPath);
        const outFullPath = path.join(base, relPath);

        if (ent.isDirectory()) {
            if (IGNORE_DIRS.includes(ent.name)) continue;
            ensureDir(outFullPath);
            await walk(fullPath, base);
        } else if (ent.isFile()) {
            const ext = path.extname(ent.name).toLowerCase();
            if (['.html', '.js', '.css'].includes(ext)) {
                await processFile(fullPath, outFullPath, ext);
            } else {
                // 非目标文件直接复制（图片、字体等）
                fs.copyFileSync(fullPath, outFullPath);
            }
        }
    }
}

/**
 * 压缩 public 目录下的 html/css/js（原地覆盖）。
 * @param {string} [publicDir] public 目录绝对路径；缺省取 ./public
 */
async function compress(publicDir) {
    const base = publicDir || path.resolve(process.cwd(), 'public');
    if (!fs.existsSync(base)) {
        console.error(`[compress] 源目录不存在：${base}`);
        return;
    }
    ensureDir(base);
    const start = Date.now();
    await walk(base, base);
    console.log(`\n🎉 [compress] 压缩完成，用时 ${Date.now() - start}ms`);
}

module.exports = compress;

// 直接运行时（node compress.js）仍可按旧方式手动压缩
if (require.main === module) {
    compress().catch((e) => {
        console.error('[compress] 运行失败:', e);
        process.exit(1);
    });
}
