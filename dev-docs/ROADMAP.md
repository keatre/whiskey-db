# 🛣️ Project Roadmap

This document outlines planned features, improvements, and future directions for this project.  
It is a living document — priorities may shift as development progresses.  

---

## ✅ Current Focus (Next Release)
- [ ] Performance improvements on bootup
- [ ] Update the market price process - calls .csv right now, but would like to improve this

---

## 🔮 Planned Enhancements (Future)
- [ ] Enhancement 1 — bake dependencies into images so containers start instantly (no pip install/npm install at runtime) 
- [ ] Enhancement 2 - api/app/routers/uploads.py; Update streaming case (no or wrong Content-Length)



---

## 💡 Ideas / Nice-to-Haves
*(Not scheduled, but captured here for visibility)*  
- [ ] Is it possible to scan the barcode of a bottle, and the app lookup this bottle with relevant information like price, general tasting notes, etc. - and then allow a "Add purchase", and read metadata from the image to add.  Basically I scan the UPC code, and then the app grabs all meta data, and allows me to just click "add" so its included in my 'inventory'. 
- [ ] Idea 1 — Admin portal for user management
- [ ] Idea 1 — Admin portal for uploading a new .csv for prices / and or directly updating on the web?


---

## 📅 Long-Term Vision
- Audit logs and audit write to all tables 
- Potential fork for wine and/or other booze - allow for a bar management and to see spending

---

## 🔗 Related Resources
- [CHANGELOG.md](./CHANGELOG.md) — past releases & updates  
- [GitHub Issues](../../issues) — active discussions and tracking  
- [Project Board](../../projects) — current work in progress  

---

## Completed
- [x] Fix the backup process, allow encrypted backups or not, and ensure it's working
- [x] Fix "File to large" issue
- [x] Add option to bottle to denote "rare", and allow searching against "rare" and displaying an "*" next to the name in bottles
- [x] Feature A — Refresh the page on a successful login with admin  
- [X] Improvement C — Change the filter/criteria of the page, and make it user "selectable"
- [x] Add option in the backup process to backup the docker-compose.yml and .env files, as well
- [x] Allow option to overwrite, but when a opened date is saved, automatically change the bottle status to open, when a kill date is put in, automatically flip to finished
- [x] Bugfix — Correct security login 

*Last updated: 2025-10-01*
