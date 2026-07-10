function textContent(markup) {
  return String(markup)
    .replace(/^---\n[\s\S]*?\n---(?:\n|$)/, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function homepageTrustClaimFailures(markup) {
  const text = textContent(markup);
  const failures = [];
  for (const required of ['待复核', '不代表代码已经实际运行', '页面复核状态']) {
    if (!text.includes(required)) failures.push(`homepage trust copy is missing: ${required}`);
  }
  for (const forbidden of [
    /项目笔记会落到真实源码、核心文件与一个可以动手验证的最小实验/,
    /每篇都有能力承诺/,
  ]) {
    if (forbidden.test(text)) failures.push(`homepage makes an unsupported universal capability claim: ${forbidden.source}`);
  }
  return failures;
}
