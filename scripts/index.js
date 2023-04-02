import { Command } from 'commander';
import { NFTStorage } from 'nft.storage';
import { join } from 'path';
import { readFileSync, writeFileSync, writeFile, renameSync, readdirSync, statSync } from 'fs';

const program = new Command();

program.version('0.0.1')
  .name('profiles-util')
  .description('Profiles utility');

program.command('extract')
  .description('Extract profiles from issue')
  .argument('<string>', 'Issue body to extract from')
  .action(extractIssue);

program.command('add-applicant')
  .description('Add new applicant')
  .argument('<string>', 'Issue body')
  .action(addProfile);

program.parse()


function extractIssue(issueBody) {
  const profiles = {};
  issueBody.split('\n').forEach(line => {
    const [key, value] = line.split(':');
    profiles[key.trim()] = value.trim();
  })
  console.log(profiles);
  return profiles;
}

function addProfile(issueBody) {
  const profile = extractIssue(issueBody);
  const picturesDir = 'pictures';
  const targetDir = 'selected_pictures';
  const id = profile['Picture'];
  const file = id + '.png'

  selectPicture(file, picturesDir, targetDir);
  updateMetadata(profile, 'profiles');
  appendRecord(id, 'release.md');
}

function appendRecord(id, targetFile) {
  let data = readFileSync(targetFile, 'utf8');
  const newData = data.length === 0 ? id : data.trim() + '\n' + id;
  writeFileSync(targetFile, newData, 'utf8');
  console.log('New applicant written to release.md');
}

function updateMetadata(profile, targetDir) {
  const meta = {
    "name": "Darwinia Community DAO Profile #0",
    "description": "",
    "image": "ipfs://{dir_cid}/uuid",
    "external_url": "",
    "attributes": []
  };
  ["Nickname", "Role"].forEach(
    key => {
      meta['attributes'].push(
        { "trait_type": key, "value": profile[key] }
      )
    }
  );
  console.log(meta);
  const target = join(targetDir, profile['Picture'] + '.json');

  writeFile(target, JSON.stringify(meta, null, 2), (err) => {
    if (err) throw err;
    console.log('Data written to file');
  });
}

function selectPicture(file, sourceDir, targetDir) {
  const filePath = findFile(sourceDir, file);
  if (filePath) {
    const targetPath = join(targetDir, file);
    renameSync(filePath, targetPath);
    console.log(`Moved ${filePath} to ${targetPath}`);
  } else {
    console.log('File not found');
  }
}

function findFile(dir, targetFileName) {
  const files = readdirSync(dir);
  for (const file of files) {
    const filePath = join(dir, file);
    const stat = statSync(filePath);
    if (stat.isFile() && file === targetFileName) {
      return filePath;
    }
  }
  return null;
}
