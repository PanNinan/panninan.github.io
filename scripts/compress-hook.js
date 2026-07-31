// Hexo 扩展脚本：在 `hexo generate` 生成 public/ 之后，自动压缩其中的 html/css/js。
// Hexo 会自动加载 scripts/ 目录下的 .js 文件，并把 `hexo` 实例注入为全局变量。
//
// 启用/关闭：在 _config.yml 中设置 `compress: true | false`（默认开启）。
// 这样 `hexo g -d` 一条命令即可完成「生成 → 压缩 → 部署」。

const path = require('path');
const compress = require(path.join(__dirname, '..', 'compress.js'));

hexo.extend.filter.register('after_generate', async function () {
    if (hexo.config.compress === false) {
        hexo.log.info('[compress] 已在 _config.yml 中关闭，跳过压缩');
        return;
    }
    hexo.log.info('[compress] 开始压缩 public/ 下的 html/css/js ...');
    try {
        await compress(hexo.public_dir);
        hexo.log.info('[compress] 压缩完成');
    } catch (e) {
        // 压缩失败不应阻断部署，仅记录错误
        hexo.log.error('[compress] 压缩失败：' + (e && e.message ? e.message : e));
    }
});
