// Hexo 扩展脚本：给「GitHub 每日热门」博文里的表格注入专属样式。
//
// 开关与生效条件（与 compress-hook.js 的 compress 开关同模式）：
//   1. _config.yml 中 `table_style: false` 时强制关闭（默认开启）；
//   2. 仅在主主题为 landscape 时生效——注入的 CSS 作用域是 landscape 的
//      `.article-entry` 容器，其他主题（NexT/Fluid/Cactus）内容容器 class
//      不同，注入后不生效，故直接跳过，避免无效注入。
//
// 为什么用 after_render:html 而不是 after_generate？
//   - landscape 是 npm 主题（node_modules/hexo-theme-landscape），不能改其文件；
//   - 该主题布局没有 inject_point，_config.yml 的 inject 不生效；
//   - after_generate 在部分 Hexo 版本下早于 public/ 文件落盘触发，文件遍历会扑空；
//   - after_render:html 在【每一页渲染完成、写盘之前】拿到完整 HTML 字符串，
//     直接改写返回即可，与主题、站点基路径、文件落盘时机都无关，最稳。
//
// 调优入口：下方 TABLE_CSS 里的列宽（nth-child 3=描述、5/6=星标）、padding、对齐。

const TABLE_CSS = `
/* ===== Trending 博文表格样式（脚本注入，勿在主题内找） ===== */
.article-entry table {
  table-layout: fixed;        /* 关键：列宽由表头定义，描述列不再无限撑宽 */
  width: 100%;
  border-collapse: collapse;
  margin: 1.4em 0;
  font-size: 14px;
  line-height: 1.55;
  word-break: break-word;     /* 长英文描述允许断行，避免挤占星标列 */
  overflow-wrap: anywhere;
}
.article-entry table th,
.article-entry table td {
  border: 1px solid #e3e6ea;
  padding: 9px 12px;          /* 单元格间隔 */
  vertical-align: top;
  text-align: left;
}
.article-entry table thead th {
  background: #f5f7fa;
  font-weight: 600;
  color: #2c3e50;
  border-bottom: 2px solid #d0d7de;
}
.article-entry table tbody tr:nth-child(even) { background: #fafbfc; }
.article-entry table tbody tr:hover { background: #eef4ff; }

/* 列宽：语言桶 6 列 / AI 桶 5 列 通用（第 5 列在两张表里都是星标列） */
.article-entry table th:nth-child(1) { width: 5%;  text-align: center; }  /* # */
.article-entry table th:nth-child(2) { width: 18%; }                       /* 项目 */
.article-entry table th:nth-child(3) { width: 45%; }                       /* 描述（收窄） */
.article-entry table th:nth-child(4) { width: 10%; }                       /* 语言 */
.article-entry table th:nth-child(5) { width: 10%; text-align: right; }   /* 今日/总星标 */
.article-entry table th:nth-child(6) { width: 12%; text-align: right; }   /* 总星标 */

.article-entry table td:nth-child(1) { text-align: center; color: #8a94a6; }
.article-entry table td:nth-child(5),
.article-entry table td:nth-child(6) {
  text-align: right;
  font-variant-numeric: tabular-nums;   /* 数字等宽，右对齐更整齐 */
  white-space: nowrap;                  /* 星标数不换行 */
}
`;

hexo.extend.filter.register('after_render:html', function (str) {
  if (typeof str !== 'string') return str;

  // 配置开关：_config.yml 中 table_style: false 时关闭（默认开启）
  if (hexo.config.table_style === false) {
    return str;
  }

  // 主题门禁：注入的 CSS 仅对 landscape 的 .article-entry 容器有效，
  // 其他主题目容器 class 不同，注入无意义，直接跳过。
  if (hexo.config.theme !== 'landscape') {
    return str;
  }

  // 仅当该页含趋势表（表头含「星标」字样）且尚未注入时才处理
  if (str.indexOf('今日星标') === -1 && str.indexOf('总星标') === -1) return str;
  if (str.indexOf('trending-table-style') !== -1) return str;
  const styleTag = `<style id="trending-table-style">${TABLE_CSS}</style>`;
  hexo.log.info('[table-style] 已注入趋势表样式');
  if (str.indexOf('</head>') !== -1) {
    return str.replace('</head>', styleTag + '\n</head>');
  }
  return styleTag + '\n' + str;
});
