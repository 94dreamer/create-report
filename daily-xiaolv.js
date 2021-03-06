const core = require("@actions/core");
const { Octokit } = require("@octokit/rest");
const { exec } = require("child_process");
const { ReposEnum, ReposChatMap } = require("./const");

const wxhook = core.getInput("wxhook");
const token = core.getInput("token");

const octokit = new Octokit({ auth: token });

function renderMark(data) {

  const IssuesList = data
    .filter((item) => !item.pull_request && item.labels.every(l => l.name !== 'WIP'))
    .map((item) => ({
      created_time: item.created_at.split("T")[0],
      html_url: item.html_url,
      title: item.title,
      repo: item.repository_url.split("Tencent/")[1],
      created_at: item.created_at.split("T")[0].replaceAll("-", ""),
    }))
    .sort((a, b) => a.created_at - b.created_at)
    .slice(0, 10);

  const PullList = data
    .filter((item) => item.pull_request)
    .map((item) => ({
      created_time: item.created_at.split("T")[0],
      html_url: item.html_url,
      title: item.title,
      repo: item.repository_url.split("Tencent/")[1],
      created_at: item.created_at.split("T")[0].replaceAll("-", ""),
    }))
    .sort((a, b) => a.created_at - b.created_at)
    .slice(0, 10);

  return [
    `### **${data.repoName}** issues 情况
[未关闭 issue 数量：${data.filter((n) => !n.pull_request).length}](https://github.com/Tencent/${data.repoName
    }/issues?q=is%3Aopen+is%3Aissue)
[未认领 issue 数量：${data.filter((n) => !n.pull_request && !n.assignee).length
    }](https://github.com/Tencent/${data.repoName}/issues?q=is%3Aopen+is%3Aissue+no%3Aassignee)
#### 未关闭时长 Top10
${IssuesList.map((item) => `- [${item.title}](${item.html_url}) ${item.created_time}创建`).join(
      "\n"
    )}`,
    `### **${data.repoName}** pr 情况
[未关闭 pr 数量：${data.filter((n) => n.pull_request).length
    }](https://github.com/Tencent/${data.repoName}/pulls?q=is%3Aopen+is%3Apr)
#### 未合并时长 Top10
${PullList.map((item) => `- [${item.title}](${item.html_url}) ${item.created_time}创建`).join("\n")}`,
  ];
}

async function getRepoIssuesInfo(repo) {
  // open 数量
  // open 且 未指定 assignees 数量 以及 issue 标题 链接 列表
  // open 各仓库时长排序top 汇总 再取top10

  return octokit.rest.issues
    .listForRepo({
      owner: "Tencent",
      repo: repo,
      state: "open",
      sort: "created",
      direction: "asc",
    })
    .then((res) => {
      res.data.repoName = repo;
      return res.data;
    });
}

async function main() {
  // 调取 参数指定的 ReposEnum 的issue 情况
  // 形成 infoData
  // 灌入模版 生成图表
  const resultArr = await Promise.all(ReposEnum.map((repo) => getRepoIssuesInfo(repo)));

  resultArr.forEach((data, index) => {
    const markdownStringArr = renderMark(data);
    markdownStringArr.forEach((markdownString) => {
      // 个人
      exec(
        `curl ${wxhook} \
       -H 'Content-Type: application/json' \
       -d '
       {
            "chatid": "${ReposChatMap[ReposEnum[index]]}",
            "msgtype": "markdown",
            "markdown": {
                "content": "${markdownString.replaceAll('"', "'")}"
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
  })

}

module.exports = main;