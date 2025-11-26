import * as vscode from 'vscode';

export async function addToWorkspaceRecommendations(extId: string) {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) { vscode.window.showWarningMessage('Open a folder to edit workspace recommendations.'); return; }
  const uri = vscode.Uri.joinPath(folder.uri, '.vscode', 'extensions.json');
  let json: any = { recommendations: [] };
  try { const buf = await vscode.workspace.fs.readFile(uri); json = JSON.parse(Buffer.from(buf).toString('utf8')); } catch {}
  json.recommendations = Array.from(new Set([...(json.recommendations||[]), extId]));
  const bytes = Buffer.from(JSON.stringify(json, null, 2));
  await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(folder.uri, '.vscode'));
  await vscode.workspace.fs.writeFile(uri, bytes);
  vscode.window.showInformationMessage(`Added ${extId} to workspace recommendations.`);
}

export async function removeFromWorkspaceRecommendations(extId: string) {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) { vscode.window.showWarningMessage('Open a folder to edit workspace recommendations.'); return; }
  const uri = vscode.Uri.joinPath(folder.uri, '.vscode', 'extensions.json');
  let json: any = { recommendations: [] };
  try { const buf = await vscode.workspace.fs.readFile(uri); json = JSON.parse(Buffer.from(buf).toString('utf8')); } catch {}
  json.recommendations = (json.recommendations||[]).filter((x: string)=>x!==extId);
  const bytes = Buffer.from(JSON.stringify(json, null, 2));
  await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(folder.uri, '.vscode'));
  await vscode.workspace.fs.writeFile(uri, bytes);
  vscode.window.showInformationMessage(`Removed ${extId} from workspace recommendations.`);
}
