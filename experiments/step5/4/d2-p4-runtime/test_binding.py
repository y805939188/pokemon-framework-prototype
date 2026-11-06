import copy
from pathlib import Path
import tempfile
import unittest
from binding import inventory, compare_inventory, verify_declared_diff, inspect_template


class BindingControls(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)/"fixture";self.root.mkdir()
        (self.root/"Contents").mkdir();(self.root/"Contents/file").write_bytes(b"tool fixture, not APP")
        (self.root/"Contents/link").symlink_to("file")

    def test_full_regular_files_modes_directories_links(self):
        rows=inventory(self.root)
        self.assertEqual(rows["Contents/link"]["target"],"file")
        self.assertEqual(rows["Contents/file"]["kind"],"file")
        self.assertIn(".",rows)
        self.assertEqual(compare_inventory(self.root,rows)["members"],4)

    def test_mutated_bytes_rejected(self):
        rows=inventory(self.root);(self.root/"Contents/file").write_bytes(b"different")
        with self.assertRaises(ValueError):compare_inventory(self.root,rows)

    def test_changed_mode_rejected(self):
        rows=inventory(self.root);p=self.root/"Contents/file";p.chmod(p.stat().st_mode^0o100)
        with self.assertRaises(ValueError):compare_inventory(self.root,rows)

    def test_extra_empty_directory_rejected(self):
        rows=inventory(self.root);(self.root/"extra").mkdir()
        with self.assertRaises(ValueError):compare_inventory(self.root,rows)

    def test_external_relative_link_rejected_without_traversal(self):
        (self.root/"external").symlink_to("../")
        with self.assertRaises(ValueError):inventory(self.root)

    def test_absolute_link_rejected(self):
        (self.root/"absolute").symlink_to(self.root/"Contents/file")
        with self.assertRaises(ValueError):inventory(self.root)

    def test_dangling_internal_link_rejected(self):
        (self.root/"dangling").symlink_to("missing")
        with self.assertRaises(FileNotFoundError):inventory(self.root)

    def test_exact_diff_path_both_member_identities_and_reason_required(self):
        control=inventory(self.root);candidate=copy.deepcopy(control)
        candidate["Contents/file"]["sha256"]="a"*64
        declared={"Contents/file":{"control":control["Contents/file"],"candidate":candidate["Contents/file"],"reason":"fixture byte change"}}
        self.assertEqual(verify_declared_diff(control,candidate,declared),["Contents/file"])
        for bad in ({},{"Contents":{}},{"Contents/file":{"reason":"broad waiver"}}):
            with self.subTest(bad=bad):
                with self.assertRaises(ValueError):verify_declared_diff(control,candidate,bad)

    def test_static_template_never_grants_native_admission(self):
        template={"version":"D2-P4-runtime-binding-template-v1","nativeEntry":"NOT_IMPLEMENTED_NO_LAUNCH_CLI","required":{"product":None,"host":None}}
        self.assertEqual(inspect_template(template)["status"],"BLOCKED")
        template["required"]["host"]=True
        with self.assertRaises(ValueError):inspect_template(template)


if __name__ == "__main__":unittest.main(verbosity=2)
