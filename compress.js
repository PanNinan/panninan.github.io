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

// ---- 字符串级压缩（供 after_render 钩子逐文件调用，避免依赖 public/ 落盘时机）----
async function compressHtml(str) {
    return htmlMinify(str, htmlOpts);
}
async function compressCss(str) {
    return cleanCss.minify(str).styles;
}
async function compressJs(str) {
    const ret = await terserMinify(str);
    if (ret.error) throw ret.error;
    return ret.code;
}

// 文件级处理（compress(publicDir) 与 node compress.js 手动调用）
async function processFile(srcPath, outPath, ext) {
    const raw = fs.readFileSync(srcPath, 'utf8');
    let result;

    try {
        if (ext === '.html') {
            result = await compressHtml(raw);
        } else if (ext === '.js') {
            result = await compressJs(raw);
        } else if (ext === '.css') {
            result = await compressCss(raw);
        }

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
            if (!fs.existsSync(outFullPath)) fs.mkdirSync(outFullPath, { recursive: true });
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
    if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true });
    const start = Date.now();
    await walk(base, base);
    console.log(`\n🎉 [compress] 压缩完成，用时 ${Date.now() - start}ms`);
}

// 导出：文件级入口 + 字符串级入口（供 after_render 钩子复用）
module.exports = compress;
module.exports.compressHtml = compressHtml;
module.exports.compressCss = compressCss;
module.exports.compressJs = compressJs;

// 直接运行时（node compress.js）仍可按旧方式手动压缩
if (require.main === module) {
    compress().catch((e) => {
        console.error('[compress] 运行失败:', e);
        process.exit(1);
    });
}
