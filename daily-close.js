// 收集每个仓库的close，找到昨天完成的。
// 渲染
// 机器人推送 id
const { Octokit } = require("@octokit/rest");
const { exec } = require("child_process");
const { ReposEnum } = require("./const");
const dayjs = require("dayjs");
const truncate = require('lodash/truncate');

const MAX_CONTENT_LENGTH = 2048;


class DailyClose {
  constructor({ wxhook, token, octokit }) {
    this.wxhook = wxhook;
    this.octokit = octokit || new Octokit({ auth: token });
    this.title = "昨天关闭的 ISSUE/PR";
    this.chatid = "";
    this.dateString = dayjs().subtract(1, "day").format("YYYY-MM-DD");
  }

  async getData() {
    const allList = await Promise.all(
      ReposEnum.map((repo) =>
        this.octokit.rest.issues
          .listForRepo({
            owner: "Tencent",
            repo: repo,
            state: "closed",
            sort: "updated",
          })
          .then((res) => {
            const arr = res.data
              .filter((item) => item.closed_at.split("T")[0] === this.dateString && item.user.login !== "dependabot[bot]")
              .map((item) => ({
                ...item,
                repo: item.repository_url.split("Tencent/")[1],
              }));
            arr.repoName = repo;
            return arr;
          })
      )
    );
    return allList;
  }
  async render(data) {
    if (data.every((li) => !li.length)) return "";
    return [
      `## 关闭的ISSUE（${this.dateString}）

${data
        .filter((repo) => repo.filter((item) => !item.pull_request).length)
        .map((repo) => {
          return `#### ${repo.repoName}
${repo
              .filter((item) => !item.pull_request)
              .map((item) => {
                return `- ${item.title} [@${item.user.login}](${item.html_url})`;
              })
              .sort()
              .join("\n")}`;
        })
        .join("\n \n")}`,
      `## 合并的PR（${this.dateString}）

${data
        .filter((repo) => repo.filter((item) => item.pull_request).length)
        .map((repo) => {
          return `#### ${repo.repoName}
${repo
              .filter((item) => item.pull_request)
              .map((item) => {
                return `- ${item.title} [@${item.user.login}](${item.html_url})`;
              })
              .sort()
              .join("\n")}`;
        })
        .join("\n \n")}`,
    ];
  }
  async run() {
    let res;
    try {
      res = await this.getData();
    } catch (error) {
      console.log(error, "error");
    }

    if (!res) return false;
    const templates = await this.render(res);

    //  内部用户和个人
    templates.forEach((template) => {
      template = truncate(template, {
        length: MAX_CONTENT_LENGTH,
        separator: /(\r|\n|\r\n)+/,
        omission: '\n\nToo large to show...',
      }).replaceAll('"', "'");

      exec(
        `curl ${this.wxhook} \
         -H 'Content-Type: application/json' \
         -d '
         {
              "msgtype": "markdown",
              "chatid": "wrkSFfCgAAZNoKR-17rH0oN7VXN-D3gg|wrkSFfCgAA-QNmuIjascLNFfmkFVQT5A",
              "markdown": {
                  "content": "${template}"
              }
         }'`,
        (error, stdout, stderr) => {
          if (error) {
            console.error(`exec error: ${error}`);
            return;
          }
          console.log(`stdout: ${stdout}`);
          console.error(`stderr: ${stderr}`);
        }
      );
    });
  }
}

module.exports = DailyClose;