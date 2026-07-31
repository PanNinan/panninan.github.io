// Hexo 扩展脚本：在生成每个 html/css/js 文件「写盘之前」就地压缩。
//
// 为什么用 after_render 而非 after_generate？
//   - 本环境下 after_generate 早于 public/ 落盘触发，此时扫整目录会扑空，
//     报「源目录不存在」且实际未压缩（见原实现的历史坑）；
//   - after_render:html / :css / :js 在【每一个文件渲染完成、写盘之前】拿到
//     完整字符串，直接返回压缩结果即可，时机与落盘一致，最稳。
//
// 启用/关闭：在 _config.yml 中设置 `compress: true | false`（默认开启）。
// 这样 `hexo g -d` 一条命令即可完成「生成 → 压缩 → 部署」。
//
// 字符串级压缩函数（compressHtml/Css/Js）由 compress.js 提供，与手动
// `node compress.js` 共用同一套压缩逻辑，避免重复实现。

const path = require('path');
const compress = require(path.join(__dirname, '..', 'compress.js'));

function isEnabled() {
    return hexo.config.compress !== false;
}

hexo.extend.filter.register('after_render:html', async function (str) {
    if (!isEnabled() || typeof str !== 'string') return str;
    try {
        return await compress.compressHtml(str);
    } catch (e) {
        hexo.log.warn('[compress] HTML 压缩失败，保留原样：' + (e && e.message ? e.message : e));
        return str;
    }
});

hexo.extend.filter.register('after_render:css', async function (str) {
    if (!isEnabled() || typeof str !== 'string') return str;
    try {
        return await compress.compressCss(str);
    } catch (e) {
        hexo.log.warn('[compress] CSS 压缩失败，保留原样：' + (e && e.message ? e.message : e));
        return str;
    }
});

hexo.extend.filter.register('after_render:js', async function (str) {
    if (!isEnabled() || typeof str !== 'string') return str;
    try {
        return await compress.compressJs(str);
    } catch (e) {
        hexo.log.warn('[compress] JS 压缩失败，保留原样：' + (e && e.message ? e.message : e));
        return str;
    }
});
